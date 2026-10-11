import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getSpot, type Spot } from '../spots';
import {
	buildCoopsPredictionsUrl,
	buildTidePredictions,
	createCoopsAdapter,
	createCoopsSource,
	parseCoopsTime,
	type CoopsFetchLike,
	type CoopsSource,
	type RawTidePrediction
} from './coops';
import { createSpotDataService } from './service';
import { ProviderError, type ForecastWindow } from './types';

const FIXTURES = new URL('../../../fixtures/coops/', import.meta.url);
const HOURLY = new URL('predictions.9410230.2026-10-11..2026-10-13.hourly.json', FIXTURES);
const HILO = new URL('predictions.9410230.2026-10-11..2026-10-13.hilo.json', FIXTURES);

/** The full 3-day range the fixtures cover. */
const FULL_WINDOW: ForecastWindow = {
	start: '2026-10-11T00:00:00Z',
	end: '2026-10-13T23:00:00Z'
};

function readPredictions(url: URL): RawTidePrediction[] {
	return (JSON.parse(readFileSync(url, 'utf8')) as { predictions: RawTidePrediction[] })
		.predictions;
}

const hourlyFixture = readPredictions(HOURLY);
const extremesFixture = readPredictions(HILO);

function spotOrThrow(id: string): Spot {
	const spot = getSpot(id);
	if (!spot) throw new Error(`test fixture spot missing: ${id}`);
	return spot;
}

const spot = spotOrThrow('la-jolla-shores');

/** A source that replays the committed fixtures, ignoring station/window. */
function fixtureSource(): CoopsSource {
	return {
		async getPredictions(_stationId, _window, interval) {
			return interval === 'hilo' ? extremesFixture : hourlyFixture;
		}
	};
}

describe('buildCoopsPredictionsUrl', () => {
	it('builds the Data API query for a station over the window', () => {
		const url = new URL(buildCoopsPredictionsUrl({ stationId: '9410230', window: FULL_WINDOW }));
		expect(url.origin + url.pathname).toBe(
			'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
		);
		expect(url.searchParams.get('product')).toBe('predictions');
		expect(url.searchParams.get('station')).toBe('9410230');
		expect(url.searchParams.get('begin_date')).toBe('20261011');
		expect(url.searchParams.get('end_date')).toBe('20261013');
		expect(url.searchParams.get('datum')).toBe('MLLW');
		expect(url.searchParams.get('units')).toBe('metric');
		expect(url.searchParams.get('time_zone')).toBe('gmt');
		expect(url.searchParams.get('format')).toBe('json');
		expect(url.searchParams.get('interval')).toBe('h');
	});

	it('honours the hilo interval', () => {
		const url = new URL(
			buildCoopsPredictionsUrl({ stationId: '9410230', window: FULL_WINDOW, interval: 'hilo' })
		);
		expect(url.searchParams.get('interval')).toBe('hilo');
	});
});

describe('parseCoopsTime', () => {
	it('reads GMT datagetter timestamps as UTC ISO instants', () => {
		expect(parseCoopsTime('2026-10-11 04:55')).toBe('2026-10-11T04:55:00.000Z');
		expect(parseCoopsTime('2026-10-11 00:00:00')).toBe('2026-10-11T00:00:00.000Z');
	});

	it('returns null for unparseable input', () => {
		expect(parseCoopsTime('not a time')).toBeNull();
		expect(parseCoopsTime('')).toBeNull();
	});
});

describe('buildTidePredictions', () => {
	it('merges the hourly curve and high/low events into one sorted series', () => {
		const predictions = buildTidePredictions(hourlyFixture, extremesFixture, FULL_WINDOW);

		expect(predictions).toHaveLength(hourlyFixture.length + extremesFixture.length);
		expect(predictions[0]).toEqual({
			time: '2026-10-11T00:00:00.000Z',
			heightM: 0.137,
			highLow: null
		});
		expect(predictions.every((point) => Number.isFinite(point.heightM))).toBe(true);
		expect([...predictions].sort((a, b) => (a.time < b.time ? -1 : 1))).toEqual(predictions);

		const high = predictions.find((point) => point.time === '2026-10-11T04:55:00.000Z');
		expect(high).toEqual({ time: '2026-10-11T04:55:00.000Z', heightM: 1.421, highLow: 'high' });
		const low = predictions.find((point) => point.time === '2026-10-11T10:29:00.000Z');
		expect(low?.highLow).toBe('low');
	});

	it('clips to the requested window (extremes inclusive)', () => {
		const predictions = buildTidePredictions(hourlyFixture, extremesFixture, {
			start: '2026-10-11T00:00:00Z',
			end: '2026-10-11T05:00:00Z'
		});
		expect(predictions.map((point) => point.time)).toEqual([
			'2026-10-11T00:00:00.000Z',
			'2026-10-11T01:00:00.000Z',
			'2026-10-11T02:00:00.000Z',
			'2026-10-11T03:00:00.000Z',
			'2026-10-11T04:00:00.000Z',
			'2026-10-11T04:55:00.000Z',
			'2026-10-11T05:00:00.000Z'
		]);
	});

	it('lets an extreme that lands on the hour carry the flag without duplicating', () => {
		const hourly: RawTidePrediction[] = [{ t: '2026-10-11 04:00', v: '1.2' }];
		const extremes: RawTidePrediction[] = [{ t: '2026-10-11 04:00', v: '1.25', type: 'H' }];
		const predictions = buildTidePredictions(hourly, extremes, FULL_WINDOW);
		expect(predictions).toEqual([
			{ time: '2026-10-11T04:00:00.000Z', heightM: 1.25, highLow: 'high' }
		]);
	});

	it('drops malformed rows', () => {
		const predictions = buildTidePredictions(
			[
				{ t: 'nope', v: '1' },
				{ t: '2026-10-11 01:00', v: 'NaN' }
			],
			[{ t: '2026-10-11 02:00', v: '1', type: 'X' as 'H' }],
			FULL_WINDOW
		);
		expect(predictions).toEqual([]);
	});
});

describe('createCoopsSource', () => {
	function fixtureFetch(calls: string[]): CoopsFetchLike {
		return async (url) => {
			calls.push(url);
			const interval = new URL(url).searchParams.get('interval');
			const rows = interval === 'hilo' ? extremesFixture : hourlyFixture;
			return new Response(JSON.stringify({ predictions: rows }), { status: 200 });
		};
	}

	it('fetches both intervals and caches raw rows by URL', async () => {
		const calls: string[] = [];
		const source = createCoopsSource({ fetchImpl: fixtureFetch(calls) });

		const hourly = await source.getPredictions('9410230', FULL_WINDOW, 'h');
		const extremes = await source.getPredictions('9410230', FULL_WINDOW, 'hilo');
		expect(hourly).toHaveLength(72);
		expect(extremes).toHaveLength(11);
		expect(calls).toHaveLength(2);

		await source.getPredictions('9410230', FULL_WINDOW, 'h');
		expect(calls).toHaveLength(2);
	});

	it('surfaces API error bodies as retryable ProviderErrors', async () => {
		const source = createCoopsSource({
			fetchImpl: async () =>
				new Response(JSON.stringify({ error: { message: 'Station not found' } }), {
					status: 200
				})
		});
		await expect(source.getPredictions('nope', FULL_WINDOW, 'h')).rejects.toMatchObject({
			name: 'ProviderError',
			retryable: true
		});
	});

	it('maps HTTP status to retryability and wraps network failures', async () => {
		const notFound = createCoopsSource({
			fetchImpl: async () => new Response('', { status: 404 })
		});
		await expect(notFound.getPredictions('9410230', FULL_WINDOW, 'h')).rejects.toMatchObject({
			retryable: false
		});

		const offline = createCoopsSource({
			fetchImpl: async () => {
				throw new Error('dns');
			}
		});
		await expect(offline.getPredictions('9410230', FULL_WINDOW, 'h')).rejects.toBeInstanceOf(
			ProviderError
		);
	});
});

describe('createCoopsAdapter', () => {
	const window: ForecastWindow = {
		start: '2026-10-11T00:00:00Z',
		end: '2026-10-11T06:00:00Z'
	};
	const now = () => Date.parse('2026-10-11T07:42:00Z');

	it('returns an MLLW series with provenance through the cache', async () => {
		const adapter = createCoopsAdapter({ source: fixtureSource(), now });
		const service = createSpotDataService({ adapters: [adapter] });

		const result = await service.getSpotData(spot, window, { providers: ['coops'] });
		expect(result.ok).toBe(true);
		expect(result.sources[0]).toMatchObject({
			provider: 'coops',
			asOf: '2026-10-11T07:42:00.000Z',
			fromCache: false,
			stale: false
		});

		const tides = result.data.coops as { stationId: string; predictions: unknown[] };
		expect(tides.stationId).toBe('9410230');
		// 00:00–06:00 hourly plus the 04:55 high.
		expect(tides.predictions).toHaveLength(8);

		const second = await service.getSpotData(spot, window, { providers: ['coops'] });
		expect(second.sources[0].fromCache).toBe(true);
	});

	it('fails as not_found when the spot has no station', async () => {
		const adapter = createCoopsAdapter({ source: fixtureSource(), now });
		const service = createSpotDataService({ adapters: [adapter] });
		const noStation: Spot = { ...spot, coopsStationId: undefined };

		await expect(
			service.getSpotData(noStation, window, { providers: ['coops'] })
		).rejects.toMatchObject({ code: 'not_found', retryable: false });
	});

	it('fails as not_found when the station returns no predictions', async () => {
		const empty: CoopsSource = {
			async getPredictions() {
				return [];
			}
		};
		const adapter = createCoopsAdapter({ source: empty, now });
		const service = createSpotDataService({ adapters: [adapter] });

		await expect(service.getSpotData(spot, window, { providers: ['coops'] })).rejects.toMatchObject(
			{ code: 'not_found', retryable: false }
		);
	});
});
