import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sampleField } from '../../lib/grib2';
import { buildNomadsWaveUrl, fetchIndexedField, type FetchLike } from './index';

const FIXTURES = new URL('../../../fixtures/nomads/', import.meta.url);
const jpegUrl = new URL('gfswave.t00z.wcoast.0p16.f000.HTSGW-full-field-jpeg2000.grib2', FIXTURES);
const idxUrl = new URL('gfswave.t00z.wcoast.0p16.f000.grib2.idx', FIXTURES);

const readBytes = (url: URL) => new Uint8Array(readFileSync(url));

/** La Jolla grid point (32.83°N, 117.33°W) — the fixtures' cross-check value. */
const LA_JOLLA = { lat: 32.83, lon: -117.33 };

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
		// Levels are omitted by default so sequence-level swell partitions come through.
		expect(url.searchParams.has('lev_surface')).toBe(false);
		expect([...url.searchParams.keys()].some((key) => key.startsWith('lev_'))).toBe(false);
		expect(url.searchParams.get('toplat')).toBe('33');
		expect(url.searchParams.get('bottomlat')).toBe('32.6');
		expect(url.searchParams.has('subregion')).toBe(true);
	});

	it('sets requested levels when given', () => {
		const url = new URL(
			buildNomadsWaveUrl({
				cycle: '2026-10-11T00:00:00Z',
				forecastHour: 0,
				variables: ['HTSGW'],
				levels: ['surface']
			})
		);
		expect(url.searchParams.get('lev_surface')).toBe('on');
		expect(url.searchParams.has('subregion')).toBe(false);
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
