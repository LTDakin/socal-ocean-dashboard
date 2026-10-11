import { describe, expect, it } from 'vitest';
import { getSpot, type Spot } from '../spots';
import type { ClarityObservation } from './coastwatch';
import type { CurrentConditions } from './current';
import type { CoopsTides, TidePrediction } from './coops';
import {
	assembleSpotsOverview,
	buildSpotOverview,
	buildTidePreview,
	compareSpotsByInfo,
	spotInfoScore,
	type SpotOverviewEntry
} from './overview';
import type { SourceRecord } from './types';

const WINDOW = { start: '2026-10-11T00:00:00.000Z', end: '2026-10-11T06:00:00.000Z' };
const NOW = Date.parse('2026-10-11T00:00:00Z');

function spotOrThrow(id: string): Spot {
	const spot = getSpot(id);
	if (!spot) throw new Error(`test fixture spot missing: ${id}`);
	return spot;
}

function tidePrediction(
	time: string,
	heightM: number,
	highLow: TidePrediction['highLow'] = null
): TidePrediction {
	return { time, heightM, highLow };
}

function coopsTides(predictions: TidePrediction[]): CoopsTides {
	return {
		spotId: 'la-jolla-shores',
		stationId: '9410230',
		datum: 'MLLW',
		units: 'metric',
		window: WINDOW,
		generatedAt: '2026-10-11T00:00:00.000Z',
		predictions
	};
}

function currentConditions(overrides: Partial<CurrentConditions> = {}): CurrentConditions {
	return {
		spotId: 'la-jolla-shores',
		observedAt: '2026-10-11T05:30:00.000Z',
		waveHeightM: 1.9,
		wavePeriodS: 12,
		waveDirDeg: 270,
		waterTempC: 21.5,
		windSpeedMs: 6.3,
		windDirDeg: 197,
		waterLevelM: 1.949,
		tideState: 'falling',
		fields: {},
		...overrides
	};
}

function clarity(overrides: Partial<ClarityObservation> = {}): ClarityObservation {
	return {
		spotId: 'la-jolla-shores',
		observedAt: '2026-10-08T12:00:00.000Z',
		kd490: 0.03424,
		secchiDepthM: 42,
		rating: 'excellent',
		pixel: { lat: 32.76, lon: -117.51 },
		...overrides
	};
}

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
	return {
		provider: 'cdip',
		asOf: '2026-10-11T05:00:00.000Z',
		fetchedAt: '2026-10-11T05:05:00.000Z',
		stale: false,
		fromCache: false,
		...overrides
	};
}

describe('buildTidePreview', () => {
	it('keeps every high/low event and decimates the hourly curve', () => {
		const predictions = [
			tidePrediction('2026-10-11T00:00:00.000Z', 1.0),
			tidePrediction('2026-10-11T01:00:00.000Z', 1.2),
			tidePrediction('2026-10-11T01:30:00.000Z', 1.4, 'high'),
			tidePrediction('2026-10-11T02:00:00.000Z', 1.1),
			tidePrediction('2026-10-11T03:00:00.000Z', 2.0),
			tidePrediction('2026-10-11T04:00:00.000Z', 0.5),
			tidePrediction('2026-10-11T04:45:00.000Z', 0.2, 'low'),
			tidePrediction('2026-10-11T06:00:00.000Z', 0.9)
		];

		const preview = buildTidePreview(predictions, WINDOW, 3);

		expect(preview.map((point) => point.time)).toEqual([
			'2026-10-11T00:00:00.000Z',
			'2026-10-11T01:30:00.000Z',
			'2026-10-11T03:00:00.000Z',
			'2026-10-11T04:45:00.000Z',
			'2026-10-11T06:00:00.000Z'
		]);
		expect(preview.find((point) => point.time === '2026-10-11T01:30:00.000Z')?.highLow).toBe(
			'high'
		);
	});

	it('lets a high/low event replace a curve point on the same instant', () => {
		const predictions = [
			tidePrediction('2026-10-11T03:00:00.000Z', 1.0),
			tidePrediction('2026-10-11T03:00:00.000Z', 2.2, 'high')
		];

		const preview = buildTidePreview(predictions, WINDOW, 1);

		expect(preview).toHaveLength(1);
		expect(preview[0]).toMatchObject({
			time: '2026-10-11T03:00:00.000Z',
			heightM: 2.2,
			highLow: 'high'
		});
	});

	it('clips points outside the window', () => {
		const predictions = [
			tidePrediction('2026-10-10T23:00:00.000Z', 3.3),
			tidePrediction('2026-10-11T00:00:00.000Z', 1.0),
			tidePrediction('2026-10-11T07:00:00.000Z', 9.9)
		];

		expect(buildTidePreview(predictions, WINDOW, 1).map((point) => point.time)).toEqual([
			'2026-10-11T00:00:00.000Z'
		]);
	});
});

describe('buildSpotOverview', () => {
	it('flattens a full result set into one row', () => {
		const overview = buildSpotOverview({
			spot: spotOrThrow('la-jolla-shores'),
			current: currentConditions(),
			clarity: clarity(),
			tides: coopsTides([tidePrediction('2026-10-11T00:00:00.000Z', 1.0)]),
			window: WINDOW
		});

		expect(overview).toMatchObject({
			id: 'la-jolla-shores',
			name: 'La Jolla Shores',
			region: 'san-diego',
			observedAt: '2026-10-11T05:30:00.000Z',
			clarityObservedAt: '2026-10-08T12:00:00.000Z',
			snapshot: {
				waveHeightM: 1.9,
				wavePeriodS: 12,
				waveDirDeg: 270,
				waterTempC: 21.5,
				windSpeedMs: 6.3,
				windDirDeg: 197,
				waterLevelM: 1.949,
				tideState: 'falling',
				clarityRating: 'excellent'
			}
		});
		expect(overview.tide?.stationId).toBe('9410230');
		expect(overview.tide?.preview).toHaveLength(1);
	});

	it('degrades a spot with no observations to nulls', () => {
		const overview = buildSpotOverview({
			spot: spotOrThrow('catalina-avalon'),
			current: null,
			clarity: null,
			tides: null,
			window: WINDOW
		});

		expect(overview.observedAt).toBeNull();
		expect(overview.tide).toBeNull();
		expect(overview.snapshot).toEqual({
			waveHeightM: null,
			wavePeriodS: null,
			waveDirDeg: null,
			waterTempC: null,
			windSpeedMs: null,
			windDirDeg: null,
			waterLevelM: null,
			tideState: null,
			clarityRating: null
		});
	});
});

describe('assembleSpotsOverview', () => {
	it('collapses provenance to one entry per provider and reports staleness', () => {
		const entries: SpotOverviewEntry[] = [
			{
				spot: spotOrThrow('la-jolla-shores'),
				current: currentConditions(),
				clarity: clarity(),
				tides: null,
				sources: [
					source({ provider: 'cdip', asOf: '2026-10-11T05:00:00.000Z' }),
					source({ provider: 'ndbc', asOf: '2026-10-11T05:10:00.000Z' })
				]
			},
			{
				spot: spotOrThrow('huntington-beach'),
				current: null,
				clarity: null,
				tides: null,
				sources: [source({ provider: 'cdip', asOf: '2026-10-11T04:00:00.000Z', stale: true })]
			}
		];

		const overview = assembleSpotsOverview(entries, WINDOW, NOW);

		expect(overview.spots).toHaveLength(2);
		expect(overview.sources.map((record) => record.provider)).toEqual(['cdip', 'ndbc']);
		// cdip keeps the newest vintage across spots…
		expect(overview.sources.find((record) => record.provider === 'cdip')?.asOf).toBe(
			'2026-10-11T05:00:00.000Z'
		);
		// …but staleness on any spot still marks the list stale.
		expect(overview.stale).toBe(true);
		expect(overview.asOf).toBe('2026-10-11T05:10:00.000Z');
	});

	it('falls back to now when nothing answered', () => {
		const overview = assembleSpotsOverview([], WINDOW, NOW);
		expect(overview.spots).toEqual([]);
		expect(overview.sources).toEqual([]);
		expect(overview.asOf).toBe('2026-10-11T00:00:00.000Z');
	});
});

describe('spotInfoScore / compareSpotsByInfo', () => {
	function overviewFor(
		id: string,
		parts: Pick<Parameters<typeof buildSpotOverview>[0], 'current' | 'clarity' | 'tides'>
	) {
		return buildSpotOverview({ spot: spotOrThrow(id), window: WINDOW, ...parts });
	}

	it('counts every populated snapshot field plus observations and tide preview', () => {
		const full = overviewFor('la-jolla-shores', {
			current: currentConditions(),
			clarity: clarity(),
			tides: coopsTides([tidePrediction('2026-10-11T00:00:00.000Z', 1.0)])
		});
		// 9 snapshot fields + observedAt + clarityObservedAt + tide preview.
		expect(spotInfoScore(full)).toBe(12);

		const empty = overviewFor('catalina-avalon', { current: null, clarity: null, tides: null });
		expect(spotInfoScore(empty)).toBe(0);
	});

	it('ranks information-rich spots ahead of sparse ones, name as the tiebreak', () => {
		const full = overviewFor('la-jolla-shores', {
			current: currentConditions(),
			clarity: clarity(),
			tides: coopsTides([tidePrediction('2026-10-11T00:00:00.000Z', 1.0)])
		});
		const partial = overviewFor('huntington-beach', {
			current: currentConditions(),
			clarity: null,
			tides: null
		});
		const empty = overviewFor('catalina-avalon', { current: null, clarity: null, tides: null });

		const ranked = [empty, partial, full].sort(compareSpotsByInfo);
		expect(ranked.map((spot) => spot.id)).toEqual([
			'la-jolla-shores',
			'huntington-beach',
			'catalina-avalon'
		]);

		// Equal scores fall back to alphabetical order.
		const laJollaCove = overviewFor('la-jolla-cove', { current: null, clarity: null, tides: null });
		const tied = [laJollaCove, empty].sort(compareSpotsByInfo);
		expect(tied.map((spot) => spot.id)).toEqual(['catalina-avalon', 'la-jolla-cove']);
	});
});
