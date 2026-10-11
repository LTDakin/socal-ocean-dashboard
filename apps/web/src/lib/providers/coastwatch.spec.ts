import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getSpot, type Spot } from '../spots';
import {
	buildCoastwatchKd490Url,
	clarityWindow,
	createCoastwatchAdapter,
	createCoastwatchSource,
	parseCoastwatchKd490,
	toClarityObservation,
	CLARITY_LOOKBACK_DAYS,
	type CoastwatchFetchLike,
	type CoastwatchSource,
	type Kd490Observation
} from './coastwatch';
import { createSpotDataService } from './service';
import { ProviderError, type ForecastWindow } from './types';

const FIXTURES = new URL('../../../fixtures/coastwatch/', import.meta.url);
const rangeBody = readFileSync(
	new URL('nesdisVHNkd490Daily.lajolla.range.2026-10-01..latest.json', FIXTURES),
	'utf8'
);

const WINDOW: ForecastWindow = {
	start: '2026-10-02T00:00:00.000Z',
	end: '2026-10-12T00:00:00.000Z'
};

function spotOrThrow(id: string): Spot {
	const spot = getSpot(id);
	if (!spot) throw new Error(`test fixture spot missing: ${id}`);
	return spot;
}

/** A synthetic griddap body with the given daily rows. */
function kd490Body(rows: (number | null)[]): string {
	return JSON.stringify({
		table: {
			columnNames: ['time', 'altitude', 'latitude', 'longitude', 'kd_490'],
			rows: rows.map((kd, i) => [`2026-10-0${i + 1}T12:00:00Z`, 0, 32.75625, -117.50625, kd])
		}
	});
}

describe('clarityWindow', () => {
	it('quantizes to the next UTC midnight with a 10-day lookback', () => {
		expect(clarityWindow(Date.parse('2026-10-11T18:30:00Z'))).toEqual({
			start: '2026-10-02T00:00:00.000Z',
			end: '2026-10-12T00:00:00.000Z'
		});
	});

	it('keeps the key stable within a UTC day', () => {
		expect(clarityWindow(Date.parse('2026-10-11T00:00:01Z'))).toEqual(
			clarityWindow(Date.parse('2026-10-11T23:59:00Z'))
		);
		expect(CLARITY_LOOKBACK_DAYS).toBe(10);
	});
});

describe('buildCoastwatchKd490Url', () => {
	it('builds a griddap range ending at the axis maximum, pinned to noon', () => {
		const url = buildCoastwatchKd490Url({ lat: 32.86, lon: -117.4, start: WINDOW.start });
		expect(
			url.startsWith('https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisVHNkd490Daily.json?')
		).toBe(true);
		expect(url).toContain('kd_490[(2026-10-02T12:00:00Z):1:last]');
		expect(url).toContain('[(0.0)]');
		expect(url).toContain('[(32.86)]');
		expect(url).toContain('[(-117.4)]');
	});
});

describe('parseCoastwatchKd490', () => {
	it('takes the newest cloud-free row and echoes the pixel', () => {
		const observation = parseCoastwatchKd490(rangeBody, 'fixture');
		expect(observation).toEqual({
			observedAt: '2026-10-08T12:00:00.000Z',
			kd490: 0.03424,
			pixel: { lat: 32.75625, lon: -117.50625000000001 }
		});
	});

	it('skips null (cloud) rows and falls back to the newest real value', () => {
		const body = JSON.stringify({
			table: {
				columnNames: ['time', 'altitude', 'latitude', 'longitude', 'kd_490'],
				rows: [
					['2026-10-01T12:00:00Z', 0, 32.75, -117.5, 0.05],
					['2026-10-02T12:00:00Z', 0, 32.75, -117.5, null],
					['2026-10-03T12:00:00Z', 0, 32.75, -117.5, 'NaN']
				]
			}
		});
		expect(parseCoastwatchKd490(body, 'gap')).toMatchObject({
			observedAt: '2026-10-01T12:00:00.000Z',
			kd490: 0.05
		});
	});

	it('returns null when every row is missing or non-positive', () => {
		expect(parseCoastwatchKd490(kd490Body([null, null]), 'cloud')).toBeNull();
		expect(parseCoastwatchKd490(kd490Body([0, -0.03]), 'invalid')).toBeNull();
		expect(parseCoastwatchKd490(JSON.stringify({ table: {} }), 'empty')).toBeNull();
	});

	it('throws on a non-JSON body', () => {
		expect(() => parseCoastwatchKd490('<html>', 'bad')).toThrowError(ProviderError);
	});
});

describe('createCoastwatchSource', () => {
	function fixtureFetch(calls: string[]): CoastwatchFetchLike {
		return async (url) => {
			calls.push(url);
			return new Response(rangeBody, { status: 200 });
		};
	}

	it('fetches once and caches by URL', async () => {
		const calls: string[] = [];
		const source = createCoastwatchSource({ fetchImpl: fixtureFetch(calls) });
		const point = { lat: 32.86, lon: -117.4 };

		const first = await source.getLatestKd490(point, WINDOW.start);
		expect(first?.kd490).toBe(0.03424);
		await source.getLatestKd490(point, WINDOW.start);
		expect(calls).toHaveLength(1);
	});

	it('treats an empty ERDDAP 404 as no observation', async () => {
		const source = createCoastwatchSource({
			fetchImpl: async () =>
				new Response('Error { code=404; message="no matching results" }', { status: 404 })
		});
		await expect(
			source.getLatestKd490({ lat: 32.86, lon: -117.4 }, WINDOW.start)
		).resolves.toBeNull();
	});

	it('surfaces HTTP failures', async () => {
		const source = createCoastwatchSource({
			fetchImpl: async () => new Response('', { status: 503 })
		});
		await expect(
			source.getLatestKd490({ lat: 32.86, lon: -117.4 }, WINDOW.start)
		).rejects.toMatchObject({ name: 'ProviderError', retryable: true });
	});
});

describe('toClarityObservation', () => {
	it('derives Secchi depth + rating from the observed Kd490', () => {
		const payload = toClarityObservation('la-jolla-shores', {
			observedAt: '2026-10-08T12:00:00.000Z',
			kd490: 0.03424,
			pixel: { lat: 32.75625, lon: -117.50625 }
		});
		expect(payload.kd490).toBeCloseTo(0.03424, 6);
		expect(payload.secchiDepthM).toBeCloseTo(42.056, 3);
		expect(payload.rating).toBe('excellent');
	});

	it('keeps a missing observation fully null', () => {
		expect(toClarityObservation('la-jolla-shores', null)).toEqual({
			spotId: 'la-jolla-shores',
			observedAt: null,
			kd490: null,
			secchiDepthM: null,
			rating: null,
			pixel: null
		});
	});
});

describe('createCoastwatchAdapter', () => {
	function sourceFor(observation: Kd490Observation | null): CoastwatchSource {
		return {
			async getLatestKd490() {
				return observation;
			}
		};
	}

	it('samples the spot point and serves derived clarity with the satellite asOf', async () => {
		let seenPoint: { lat: number; lon: number } | null = null;
		const adapter = createCoastwatchAdapter({
			source: {
				async getLatestKd490(point) {
					seenPoint = point;
					return {
						observedAt: '2026-10-08T12:00:00.000Z',
						kd490: 0.03424,
						pixel: { lat: 32.75625, lon: -117.50625 }
					};
				}
			}
		});
		const service = createSpotDataService({ adapters: [adapter] });
		const spot = spotOrThrow('la-jolla-shores');

		const result = await service.getSpotData(spot, WINDOW, { providers: ['coastwatch'] });
		expect(seenPoint).toEqual(spot.offshoreModelPoint);
		expect(result.sources[0]).toMatchObject({
			provider: 'coastwatch',
			asOf: '2026-10-08T12:00:00.000Z',
			stale: false
		});
		expect(result.data.coastwatch).toMatchObject({
			spotId: 'la-jolla-shores',
			observedAt: '2026-10-08T12:00:00.000Z',
			rating: 'excellent'
		});
	});

	it('degrades to a null observation when the lookback is all cloud', async () => {
		const adapter = createCoastwatchAdapter({ source: sourceFor(null) });
		const service = createSpotDataService({ adapters: [adapter] });
		const spot = spotOrThrow('la-jolla-shores');

		const result = await service.getSpotData(spot, WINDOW, { providers: ['coastwatch'] });
		expect(result.sources[0].asOf).toBe(WINDOW.end);
		expect(result.data.coastwatch).toMatchObject({
			observedAt: null,
			kd490: null,
			secchiDepthM: null,
			rating: null,
			pixel: null
		});
	});

	it('wraps unexpected source failures as provider errors', async () => {
		const adapter = createCoastwatchAdapter({
			source: {
				async getLatestKd490() {
					throw new ProviderError('upstream exploded', { retryable: true });
				}
			}
		});
		const service = createSpotDataService({ adapters: [adapter] });
		const spot = spotOrThrow('la-jolla-shores');

		await expect(
			service.getSpotData(spot, WINDOW, { providers: ['coastwatch'] })
		).rejects.toMatchObject({ name: 'ProviderError', retryable: true });
	});
});
