import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeFields, type FetchLike, type GribField } from '../grib2';
import { getSpot, type Spot } from '../spots';
import {
	buildGfsWaveForecast,
	createGfsWaveAdapter,
	createNomadsSource,
	latestModelCycle,
	sampleWavePoint,
	selectForecastHours,
	type GfsWaveForecast,
	type GfsWaveSource
} from './gfswave';
import { createSpotDataService } from './service';
import type { ForecastWindow } from './types';

const FIXTURES = new URL('../../../fixtures/nomads/', import.meta.url);
const SUBSET = new URL('gfswave.t00z.wcoast.0p16.f000.socal-17field-subset.grib2', FIXTURES);
const BASE_MS = Date.parse('2026-10-11T00:00:00Z');
const HOUR_MS = 60 * 60 * 1000;

function spotOrThrow(id: string): Spot {
	const spot = getSpot(id);
	if (!spot) throw new Error(`test fixture spot missing: ${id}`);
	return spot;
}

const spot = spotOrThrow('la-jolla-shores');

let cache: GribField[] | undefined;
/** Decoded fixture fields, with valid times shifted so each hour is distinct. */
function fieldsAt(hour: number): GribField[] {
	cache ??= decodeFields(new Uint8Array(readFileSync(SUBSET)));
	const validTime = new Date(BASE_MS + hour * HOUR_MS).toISOString();
	return cache.map((field) => ({ ...field, validTime }));
}

describe('latestModelCycle', () => {
	it('picks the newest 6-hourly run past the latency window', () => {
		expect(latestModelCycle(new Date('2026-10-11T03:30:00Z')).toISOString()).toBe(
			'2026-10-10T18:00:00.000Z'
		);
		expect(latestModelCycle(new Date('2026-10-11T10:00:00Z')).toISOString()).toBe(
			'2026-10-11T06:00:00.000Z'
		);
		expect(
			latestModelCycle(new Date('2026-10-11T23:00:00Z'), { latencyHours: 0 }).toISOString()
		).toBe('2026-10-11T18:00:00.000Z');
	});
});

describe('selectForecastHours', () => {
	const cycle = new Date('2026-10-11T00:00:00Z');

	it('follows the model cadence (hourly to +120 h, then 3-hourly) within the window', () => {
		const hours = selectForecastHours(cycle, {
			start: '2026-10-11T00:00:00Z',
			end: '2026-10-25T00:00:00Z'
		});
		expect(hours[0]).toBe(0);
		expect(hours).toContain(120);
		expect(hours).toContain(123);
		expect(hours).not.toContain(121);
		expect(hours[hours.length - 1]).toBe(336);
		expect(hours).toEqual([...hours].sort((a, b) => a - b));
	});

	it('clips to the window', () => {
		expect(
			selectForecastHours(cycle, { start: '2026-10-11T06:00:00Z', end: '2026-10-11T09:00:00Z' })
		).toEqual([6, 7, 8, 9]);
	});
});

describe('sampleWavePoint', () => {
	it('samples the offshore point from decoded fields', () => {
		const point = sampleWavePoint(fieldsAt(0), 32.86, -117.4);
		expect(point?.time).toBe('2026-10-11T00:00:00.000Z');
		expect(point?.waveHeightM).toBeCloseTo(0.95, 6);
		expect(point?.swellPartitions).toHaveLength(3);

		const heights = point!.swellPartitions.map(
			(partition) => partition.heightM ?? Number.NEGATIVE_INFINITY
		);
		expect(point?.swellHeightM).toBeCloseTo(Math.max(...heights), 6);
		// WVHGT / WDIR are absent from the fixture subset.
		expect(point?.windWaveHeightM).toBeNull();
		expect(point?.windSpeedMs).not.toBeNull();
		expect(point?.windDirectionDeg).toBeGreaterThanOrEqual(0);
		expect(point?.windDirectionDeg).toBeLessThan(360);
	});

	it('returns undefined when the field set has no significant wave height', () => {
		expect(sampleWavePoint([], 32.86, -117.4)).toBeUndefined();
	});
});

describe('buildGfsWaveForecast', () => {
	it('shapes the hourly series and aggregates daily extremes', () => {
		const cycle = new Date('2026-10-11T00:00:00Z');
		const window: ForecastWindow = {
			start: '2026-10-11T00:00:00Z',
			end: '2026-10-11T03:00:00Z'
		};
		const hours = [0, 1, 2, 3];
		const fieldsByHour = new Map(hours.map((hour) => [hour, fieldsAt(hour)]));

		const forecast = buildGfsWaveForecast({
			spot,
			cycle,
			window,
			hours,
			fieldsByHour,
			generatedAt: '2026-10-11T00:05:00.000Z'
		});

		expect(forecast.spotId).toBe('la-jolla-shores');
		expect(forecast.modelRun).toBe('2026-10-11T00:00:00.000Z');
		expect(forecast.hourly).toHaveLength(4);
		expect(forecast.hourly[0].time).toBe('2026-10-11T00:00:00.000Z');
		expect(forecast.daily).toHaveLength(1);
		expect(forecast.daily[0]).toMatchObject({ date: '2026-10-11', sampleCount: 4 });
		expect(forecast.daily[0].maxWaveHeightM).toBeCloseTo(0.95, 6);
	});
});

describe('createGfsWaveAdapter', () => {
	function countingSource(): { source: GfsWaveSource; calls: () => number } {
		let calls = 0;
		return {
			calls: () => calls,
			source: {
				async getHourlyFields(_cycle, hour) {
					calls += 1;
					return fieldsAt(hour);
				}
			}
		};
	}

	const window: ForecastWindow = {
		start: '2026-10-11T00:00:00Z',
		end: '2026-10-11T06:00:00Z'
	};

	it('returns the forecast through the cache with model provenance', async () => {
		const { source, calls } = countingSource();
		const adapter = createGfsWaveAdapter({
			source,
			now: () => Date.parse('2026-10-11T03:30:00Z')
		});
		const service = createSpotDataService({ adapters: [adapter] });

		const result = await service.getSpotData(spot, window);
		expect(result.ok).toBe(true);
		expect(result.sources[0]).toMatchObject({
			provider: 'gfswave',
			modelRun: '2026-10-10T18:00:00.000Z',
			asOf: '2026-10-10T18:00:00.000Z',
			fromCache: false,
			stale: false
		});

		const forecast = result.data.gfswave as GfsWaveForecast;
		expect(forecast.modelRun).toBe('2026-10-10T18:00:00.000Z');
		expect(forecast.hourly.length).toBeGreaterThan(0);
		expect(forecast.daily.length).toBeGreaterThan(0);

		const callsAfterFirst = calls();
		const second = await service.getSpotData(spot, window);
		expect(second.sources[0].fromCache).toBe(true);
		expect(calls()).toBe(callsAfterFirst);
	});

	it('fails as not_found when the window is past the model horizon', async () => {
		const { source } = countingSource();
		const adapter = createGfsWaveAdapter({
			source,
			now: () => Date.parse('2026-10-11T03:30:00Z')
		});
		const service = createSpotDataService({ adapters: [adapter] });

		await expect(
			service.getSpotData(spot, {
				start: '2027-01-01T00:00:00Z',
				end: '2027-01-02T00:00:00Z'
			})
		).rejects.toMatchObject({ code: 'not_found', retryable: false });
	});
});

describe('createNomadsSource', () => {
	it('builds a NOMADS region subset and caches per (cycle, hour)', async () => {
		const calls: string[] = [];
		const fetchImpl: FetchLike = async (url) => {
			calls.push(url);
			return new Response(new Uint8Array(readFileSync(SUBSET)), { status: 200 });
		};
		const source = createNomadsSource({ fetchImpl });
		const cycle = new Date('2026-10-11T00:00:00Z');

		const fields = await source.getHourlyFields(cycle, 0);
		expect(fields).toHaveLength(17);

		await source.getHourlyFields(cycle, 0);
		expect(calls).toHaveLength(1);

		const url = new URL(calls[0]);
		expect(url.searchParams.get('dir')).toBe('/gfs.20261011/00/wave/gridded');
		expect(url.searchParams.get('file')).toBe('gfswave.t00z.wcoast.0p16.f000.grib2');
		expect(Number(url.searchParams.get('leftlon'))).toBeCloseTo(239.6, 6);
		expect(Number(url.searchParams.get('rightlon'))).toBeCloseTo(243.2, 6);
		expect(url.searchParams.get('toplat')).toBe('34.9');
		expect(url.searchParams.get('var_HTSGW')).toBe('on');

		await source.getHourlyFields(cycle, 3);
		expect(calls).toHaveLength(2);
	});
});
