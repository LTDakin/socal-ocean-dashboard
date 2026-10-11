import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getSpot, type Spot } from '../spots';
import {
	buildCoopsObservationUrl,
	buildCoopsObservations,
	computeTideTrend,
	createCoopsObsAdapter,
	createCoopsObsSource,
	TIDE_STEADY_THRESHOLD_MPER_HOUR,
	type CoopsObsFetchLike,
	type CoopsObsSource,
	type RawCoopsObservation
} from './coops-obs';
import { createSpotDataService } from './service';
import { ProviderError, type ForecastWindow } from './types';

const FIXTURES = new URL('../../../fixtures/coops/', import.meta.url);
const waterLevelBody = readFileSync(
	new URL('water_level.9410230.2026-10-11T16Z..19Z.json', FIXTURES),
	'utf8'
);
const waterTempBody = readFileSync(
	new URL('water_temperature.9410230.latest.json', FIXTURES),
	'utf8'
);
const windBody = readFileSync(new URL('wind.9410230.latest.json', FIXTURES), 'utf8');

function rows(body: string): RawCoopsObservation[] {
	return (JSON.parse(body) as { data: RawCoopsObservation[] }).data;
}

const WINDOW: ForecastWindow = {
	start: '2026-10-11T16:00:00Z',
	end: '2026-10-11T19:00:00Z'
};

function spotOrThrow(id: string): Spot {
	const spot = getSpot(id);
	if (!spot) throw new Error(`test fixture spot missing: ${id}`);
	return spot;
}

describe('buildCoopsObservationUrl', () => {
	it('pulls water level as an MLLW range with minute precision', () => {
		const url = new URL(
			buildCoopsObservationUrl({ stationId: '9410230', product: 'water_level', window: WINDOW })
		);
		expect(url.origin + url.pathname).toBe(
			'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
		);
		expect(url.searchParams.get('product')).toBe('water_level');
		expect(url.searchParams.get('station')).toBe('9410230');
		expect(url.searchParams.get('begin_date')).toBe('20261011 16:00');
		expect(url.searchParams.get('end_date')).toBe('20261011 19:00');
		expect(url.searchParams.get('datum')).toBe('MLLW');
		expect(url.searchParams.get('units')).toBe('metric');
		expect(url.searchParams.get('time_zone')).toBe('gmt');
		expect(url.searchParams.get('format')).toBe('json');
		expect(url.searchParams.get('date')).toBeNull();
		// The API does not decode `+` as a space.
		expect(url.search).not.toContain('+');
	});

	it('asks for the latest reading for wind and water temperature', () => {
		const wind = new URL(
			buildCoopsObservationUrl({ stationId: '9410230', product: 'wind', window: WINDOW })
		);
		expect(wind.searchParams.get('date')).toBe('latest');
		expect(wind.searchParams.get('datum')).toBeNull();
		expect(wind.searchParams.get('begin_date')).toBeNull();
	});
});

describe('computeTideTrend', () => {
	it('derives the tide state from the water-level rate', () => {
		const trend = computeTideTrend(rows(waterLevelBody));
		expect(trend).not.toBeNull();
		expect(trend?.observedAt).toBe('2026-10-11T18:18:00.000Z');
		expect(trend?.waterLevelM).toBe(1.949);
		expect(trend?.tideState).toBe('falling');
		expect(trend?.rateMPerHour).toBeCloseTo(-0.0926, 3);
	});

	it('reads a rising series as rising and slack water as steady', () => {
		const rising = computeTideTrend([
			{ t: '2026-10-11 16:00', v: '1.0' },
			{ t: '2026-10-11 17:00', v: '1.5' },
			{ t: '2026-10-11 18:00', v: '2.0' }
		]);
		expect(rising).toMatchObject({ tideState: 'rising', waterLevelM: 2, rateMPerHour: 0.5 });

		const steady = computeTideTrend([
			{ t: '2026-10-11 16:00', v: '2.000' },
			{ t: '2026-10-11 18:00', v: '2.02' }
		]);
		expect(steady?.tideState).toBe('steady');
		expect(Math.abs(steady!.rateMPerHour)).toBeLessThan(TIDE_STEADY_THRESHOLD_MPER_HOUR);
	});

	it('reports a single reading as steady and drops malformed rows', () => {
		expect(computeTideTrend([{ t: '2026-10-11 16:00', v: '1.2' }])).toMatchObject({
			tideState: 'steady',
			rateMPerHour: 0
		});
		expect(
			computeTideTrend([
				{ t: 'nope', v: '1' },
				{ t: '2026-10-11 16:00', v: '' }
			])
		).toBeNull();
		expect(computeTideTrend([])).toBeNull();
	});
});

describe('buildCoopsObservations', () => {
	it('assembles the three products into one payload', () => {
		const data = buildCoopsObservations({
			spotId: 'la-jolla-shores',
			stationId: '9410230',
			window: WINDOW,
			waterLevel: rows(waterLevelBody),
			waterTemperature: rows(waterTempBody),
			wind: rows(windBody)
		});

		expect(data).toMatchObject({
			spotId: 'la-jolla-shores',
			stationId: '9410230',
			waterTempC: 21.3,
			waterTempObservedAt: '2026-10-11T07:42:00.000Z',
			windSpeedMs: 6.3,
			windDirDeg: 197,
			windObservedAt: '2026-10-11T18:12:00.000Z'
		});
		expect(data.waterLevel?.tideState).toBe('falling');
	});

	it('leaves fields null when a product has no rows', () => {
		const data = buildCoopsObservations({
			spotId: 'la-jolla-shores',
			stationId: '9410230',
			window: WINDOW,
			waterLevel: [],
			waterTemperature: [],
			wind: []
		});
		expect(data).toMatchObject({
			waterLevel: null,
			waterTempC: null,
			waterTempObservedAt: null,
			windSpeedMs: null,
			windDirDeg: null,
			windObservedAt: null
		});
	});
});

describe('createCoopsObsSource', () => {
	function fixtureFetch(calls: string[]): CoopsObsFetchLike {
		return async (url) => {
			calls.push(url);
			const product = new URL(url).searchParams.get('product');
			const body =
				product === 'water_level'
					? waterLevelBody
					: product === 'water_temperature'
						? waterTempBody
						: windBody;
			return new Response(body, { status: 200 });
		};
	}

	it('fetches each product once and caches by URL', async () => {
		const calls: string[] = [];
		const source = createCoopsObsSource({ fetchImpl: fixtureFetch(calls) });

		await source.getObservations('9410230', 'water_level', WINDOW);
		await source.getObservations('9410230', 'water_temperature', WINDOW);
		await source.getObservations('9410230', 'wind', WINDOW);
		expect(calls).toHaveLength(3);

		await source.getObservations('9410230', 'water_level', WINDOW);
		expect(calls).toHaveLength(3);
	});

	it('treats an API error body as an absent observation', async () => {
		const source = createCoopsObsSource({
			fetchImpl: async () =>
				new Response(JSON.stringify({ error: { message: 'No data was found' } }), {
					status: 200
				})
		});
		await expect(source.getObservations('9410230', 'wind', WINDOW)).resolves.toEqual([]);
	});

	it('surfaces HTTP failures', async () => {
		const source = createCoopsObsSource({
			fetchImpl: async () => new Response('', { status: 503 })
		});
		await expect(source.getObservations('9410230', 'water_level', WINDOW)).rejects.toMatchObject({
			name: 'ProviderError',
			retryable: true
		});
	});
});

describe('createCoopsObsAdapter', () => {
	function fixtureSource(): CoopsObsSource {
		return {
			async getObservations(_stationId, product) {
				if (product === 'water_level') return rows(waterLevelBody);
				if (product === 'water_temperature') return rows(waterTempBody);
				return rows(windBody);
			}
		};
	}

	it('returns the merged observation payload with the newest observation time', async () => {
		const adapter = createCoopsObsAdapter({ source: fixtureSource() });
		const service = createSpotDataService({ adapters: [adapter] });
		const spot = spotOrThrow('la-jolla-shores');

		const result = await service.getSpotData(spot, WINDOW, { providers: ['coops-obs'] });
		expect(result.ok).toBe(true);
		expect(result.sources[0]).toMatchObject({
			provider: 'coops-obs',
			asOf: '2026-10-11T18:18:00.000Z',
			stale: false
		});
		expect(result.data['coops-obs']).toMatchObject({
			stationId: '9410230',
			waterTempC: 21.3,
			windSpeedMs: 6.3,
			windDirDeg: 197
		});
	});

	it('degrades when the spot has no CO-OPS station', async () => {
		const adapter = createCoopsObsAdapter({ source: fixtureSource() });
		const service = createSpotDataService({ adapters: [adapter] });
		const spot = spotOrThrow('la-jolla-shores');
		const noStation: Spot = { ...spot, coopsStationId: undefined };

		const result = await service.getSpotData(noStation, WINDOW, { providers: ['coops-obs'] });
		expect(result.sources[0].asOf).toBe(WINDOW.start);
		expect(result.data['coops-obs']).toMatchObject({
			stationId: null,
			waterLevel: null,
			waterTempC: null,
			windSpeedMs: null
		});
	});

	it('wraps unexpected source failures as provider errors', async () => {
		const adapter = createCoopsObsAdapter({
			source: {
				async getObservations() {
					throw new ProviderError('upstream exploded', { retryable: true });
				}
			}
		});
		const service = createSpotDataService({ adapters: [adapter] });
		const spot = spotOrThrow('la-jolla-shores');

		await expect(
			service.getSpotData(spot, WINDOW, { providers: ['coops-obs'] })
		).rejects.toMatchObject({ name: 'ProviderError', retryable: true });
	});
});
