import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	byteRange,
	buildNomadsWaveUrl,
	decodeField,
	decodeFields,
	fetchIndexedField,
	inspectFields,
	parseFieldIndex,
	sampleField,
	selectField,
	selectIndexEntry,
	type FetchLike
} from './index';

const FIXTURES = new URL('../../../fixtures/nomads/', import.meta.url);
const subsetUrl = new URL('gfswave.t00z.wcoast.0p16.f000.socal-17field-subset.grib2', FIXTURES);
const jpegUrl = new URL('gfswave.t00z.wcoast.0p16.f000.HTSGW-full-field-jpeg2000.grib2', FIXTURES);
const idxUrl = new URL('gfswave.t00z.wcoast.0p16.f000.grib2.idx', FIXTURES);

const readBytes = (url: URL) => new Uint8Array(readFileSync(url));

/** La Jolla grid point (32.83°N, 117.33°W) — the fixtures' cross-check value. */
const LA_JOLLA = { lat: 32.83, lon: -117.33 };

describe('inspectFields', () => {
	it('scans every message in the subset without decoding values', () => {
		const fields = inspectFields(readBytes(subsetUrl));
		expect(fields).toHaveLength(17);
		expect(fields.map((field) => field.varAbbrev)).toContain('HTSGW');

		const htsgw = selectField(fields, { var: 'HTSGW' });
		expect(htsgw).toBeDefined();
		expect(htsgw).toMatchObject({
			varName: 'significantwaveheight',
			varAbbrev: 'HTSGW',
			units: 'm',
			validTime: '2026-10-11T00:00:00.000Z',
			modelRun: '2026-10-11T00:00:00.000Z'
		});
		// 3×4 La Jolla box (32.6–33.0°N, 117.5–117.0°W), stored south-up.
		expect(htsgw?.grid).toMatchObject({ rows: 3, cols: 4, regular: true, northUp: false });
		expect(htsgw?.grid.longitude[0]).toBeCloseTo(-117.5, 5);
	});
});

describe('decodeFields', () => {
	it('decodes the simple-packed subset to the expected HTSGW value', () => {
		const fields = decodeFields(readBytes(subsetUrl));
		expect(fields).toHaveLength(17);

		const htsgw = selectField(fields, { var: 'HTSGW' });
		expect(htsgw).toBeDefined();
		const sample = sampleField(htsgw!, LA_JOLLA.lat, LA_JOLLA.lon);
		expect(sample).toMatchObject({ row: 1, col: 1 });
		expect(sample?.value).toBeCloseTo(0.95, 6);
	});

	it('turns bitmap-masked points into null instead of NaN', () => {
		const htsgw = selectField(decodeFields(readBytes(subsetUrl)), { var: 'HTSGW' });
		expect(htsgw?.data).toContain(null);
		expect(htsgw?.data.every((value) => value === null || Number.isFinite(value))).toBe(true);
	});

	it('disambiguates repeated variables by file order', () => {
		const fields = decodeFields(readBytes(subsetUrl));
		const swell = [0, 1, 2].map((occurrence) => selectField(fields, { var: 'SWELL', occurrence }));
		expect(swell.every(Boolean)).toBe(true);
		expect(new Set(swell.map((field) => field?.key)).size).toBe(3);
		expect(selectField(fields, { var: 'NOPE' })).toBeUndefined();
	});
});

describe('decodeField', () => {
	it('decodes a single JPEG2000-packed field to the same value as the subset', () => {
		const field = decodeField(readBytes(jpegUrl));
		expect(field.varAbbrev).toBe('HTSGW');
		expect(field.grid).toMatchObject({ rows: 151, cols: 241, regular: true, northUp: true });
		expect(sampleField(field, LA_JOLLA.lat, LA_JOLLA.lon)?.value).toBeCloseTo(0.95, 6);
	});
});

describe('field index (.idx)', () => {
	it('locates a field and derives its byte range', () => {
		const entries = parseFieldIndex(readFileSync(idxUrl, 'utf8'));
		expect(entries).toHaveLength(19);

		const entry = selectIndexEntry(entries, { var: 'HTSGW', level: 'surface' });
		expect(entry?.offset).toBe(71276);
		expect(byteRange(entry!).header).toBe('bytes=71276-82194');

		// The final entry has no length without a known file size → open-ended.
		expect(byteRange(entries[entries.length - 1]).header).toBe('bytes=286157-');
	});
});

describe('buildNomadsWaveUrl', () => {
	it('builds a Grib Filter subset request', () => {
		const url = new URL(
			buildNomadsWaveUrl({
				cycle: '2026-10-11T00:00:00Z',
				forecastHour: 0,
				variables: ['HTSGW', 'PERPW'],
				subregion: { top: 33, bottom: 32.6, left: -117.5, right: -117 }
			})
		);
		expect(url.searchParams.get('dir')).toBe('/gfs.20261011/00/wave/gridded');
		expect(url.searchParams.get('file')).toBe('gfswave.t00z.wcoast.0p16.f000.grib2');
		expect(url.searchParams.get('var_HTSGW')).toBe('on');
		expect(url.searchParams.get('lev_surface')).toBe('on');
		expect(url.searchParams.get('toplat')).toBe('33');
		expect(url.searchParams.get('bottomlat')).toBe('32.6');
		expect(url.searchParams.has('subregion')).toBe(true);
	});
});

describe('fetchIndexedField', () => {
	it('fetches one field by byte Range and decodes it, offline', async () => {
		const idxText = readFileSync(idxUrl, 'utf8');
		const jpegBytes = readBytes(jpegUrl);
		const calls: Array<{ url: string; range?: string }> = [];
		const fakeFetch: FetchLike = async (url, init) => {
			const headers = init?.headers as Record<string, string> | undefined;
			calls.push({ url, range: headers?.Range });
			return url.endsWith('.idx')
				? new Response(idxText, { status: 200 })
				: new Response(jpegBytes, { status: 200 });
		};

		const field = await fetchIndexedField(
			'https://example.test/gfswave.t00z.wcoast.0p16.f000.grib2',
			{ var: 'HTSGW', level: 'surface' },
			{ fetchImpl: fakeFetch }
		);

		expect(field.varAbbrev).toBe('HTSGW');
		expect(sampleField(field, LA_JOLLA.lat, LA_JOLLA.lon)?.value).toBeCloseTo(0.95, 6);
		expect(calls).toHaveLength(2);
		expect(calls[0].url.endsWith('.idx')).toBe(true);
		expect(calls[1].range).toBe('bytes=71276-82194');
	});
});
