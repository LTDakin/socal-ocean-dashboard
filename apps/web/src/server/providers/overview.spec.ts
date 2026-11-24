import { describe, expect, it } from 'vitest';
import { getSpot, type Spot } from '../../lib/spots';
import type { ClarityObservation } from './coastwatch';
import type { CurrentConditions } from './current';
import type { CoopsTides, TidePrediction } from './coops';
import { assembleSpotsOverview, buildSpotOverview, type SpotOverviewEntry } from './overview';
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
