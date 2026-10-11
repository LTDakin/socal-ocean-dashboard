import { describe, expect, it } from 'vitest';
import { getSpot, type Spot } from '../spots';
import type { CdipObservations, WaveObservation } from './cdip';
import type { CoopsObservations } from './coops-obs';
import { buildCurrentConditions, observationWindow, type ObservationBundle } from './current';
import type { NdbcObservation, NdbcObservations } from './ndbc';
import { createSpotDataService } from './service';
import { ProviderError } from './types';
import { createCdipAdapter } from './cdip';
import { createCoopsObsAdapter } from './coops-obs';
import { createNdbcAdapter } from './ndbc';

const NOW = Date.parse('2026-10-11T18:30:00Z');

function spotOrThrow(id: string): Spot {
	const spot = getSpot(id);
	if (!spot) throw new Error(`test fixture spot missing: ${id}`);
	return spot;
}

function cdip(overrides: Partial<WaveObservation> = {}): CdipObservations {
	return {
		spotId: 'la-jolla-shores',
		stationId: '201',
		observation: {
			observedAt: '2026-10-11T17:30:00.000Z',
			waveHeightM: 1.9,
			wavePeriodS: 12,
			waveDirDeg: 270,
			...overrides
		}
	};
}

function ndbc(overrides: Partial<NdbcObservation> = {}): NdbcObservations {
	return {
		spotId: 'la-jolla-shores',
		stationId: '46254',
		observation: {
			observedAt: '2026-10-11T17:26:00.000Z',
			waveHeightM: 2.0,
			wavePeriodS: 6,
			waveDirDeg: 275,
			waterTempC: 21.5,
			windSpeedMs: null,
			windDirDeg: null,
			...overrides
		}
	};
}

function coops(overrides: Partial<CoopsObservations> = {}): CoopsObservations {
	return {
		spotId: 'la-jolla-shores',
		stationId: '9410230',
		window: observationWindow(NOW),
		waterLevel: {
			waterLevelM: 1.949,
			observedAt: '2026-10-11T18:18:00.000Z',
			rateMPerHour: -0.09,
			tideState: 'falling'
		},
		waterTempC: 21.3,
		waterTempObservedAt: '2026-10-11T07:42:00.000Z',
		windSpeedMs: 6.3,
		windDirDeg: 197,
		windObservedAt: '2026-10-11T18:12:00.000Z',
		...overrides
	};
}

describe('observationWindow', () => {
	it('rounds the end up to the next hour with a 3 h lookback', () => {
		expect(observationWindow(Date.parse('2026-10-11T18:12:00Z'))).toEqual({
			start: '2026-10-11T16:00:00.000Z',
			end: '2026-10-11T19:00:00.000Z'
		});
	});

	it('keeps the key stable on the hour boundary', () => {
		expect(observationWindow(Date.parse('2026-10-11T18:00:00Z'))).toEqual({
			start: '2026-10-11T15:00:00.000Z',
			end: '2026-10-11T18:00:00.000Z'
		});
	});
});

describe('buildCurrentConditions', () => {
	it('prefers the newest wave observation, per field', () => {
		const conditions = buildCurrentConditions({
			spotId: 'la-jolla-shores',
			bundle: { cdip: cdip(), ndbc: ndbc() },
			now: NOW
		});

		// CDIP's 17:30 observation is newer than NDBC's 17:26.
		expect(conditions).toMatchObject({ waveHeightM: 1.9, wavePeriodS: 12, waveDirDeg: 270 });
		expect(conditions.fields.waveHeightM).toEqual({
			provider: 'cdip',
			stationId: '201',
			observedAt: '2026-10-11T17:30:00.000Z',
			ageSeconds: 3600
		});
	});

	it('fills a null CDIP sub-field from the NDBC twin without discarding the rest', () => {
		const conditions = buildCurrentConditions({
			spotId: 'la-jolla-shores',
			bundle: { cdip: cdip({ waveDirDeg: null }), ndbc: ndbc() },
			now: NOW
		});

		expect(conditions.waveHeightM).toBe(1.9);
		expect(conditions.fields.waveHeightM?.provider).toBe('cdip');
		expect(conditions.waveDirDeg).toBe(275);
		expect(conditions.fields.waveDirDeg?.provider).toBe('ndbc');
	});

	it('falls back to NDBC when CDIP is the older reading', () => {
		const staleCdip = cdip({ observedAt: '2026-10-11T15:00:00.000Z', waveHeightM: 3.3 });
		const conditions = buildCurrentConditions({
			spotId: 'la-jolla-shores',
			bundle: { cdip: staleCdip, ndbc: ndbc() },
			now: NOW
		});

		expect(conditions.waveHeightM).toBe(2.0);
		expect(conditions.fields.waveHeightM?.provider).toBe('ndbc');
	});

	it('takes water temp from the buoy before the pier sensor', () => {
		const conditions = buildCurrentConditions({
			spotId: 'la-jolla-shores',
			bundle: { ndbc: ndbc(), 'coops-obs': coops() },
			now: NOW
		});
		expect(conditions.waterTempC).toBe(21.5);
		expect(conditions.fields.waterTempC?.provider).toBe('ndbc');

		const pierOnly = buildCurrentConditions({
			spotId: 'la-jolla-shores',
			bundle: { ndbc: ndbc({ waterTempC: null }), 'coops-obs': coops() },
			now: NOW
		});
		expect(pierOnly.waterTempC).toBe(21.3);
		expect(pierOnly.fields.waterTempC).toMatchObject({
			provider: 'coops-obs',
			stationId: '9410230',
			observedAt: '2026-10-11T07:42:00.000Z'
		});
	});

	it('keeps the buoy water temp even when the shore sensor is newer', () => {
		const olderBuoy = ndbc({ observedAt: '2026-10-11T16:30:00.000Z', waterTempC: 20.5 });
		const conditions = buildCurrentConditions({
			spotId: 'la-jolla-shores',
			bundle: {
				ndbc: olderBuoy,
				'coops-obs': coops({ waterTempObservedAt: '2026-10-11T18:20:00.000Z', waterTempC: 21.9 })
			},
			now: NOW
		});

		expect(conditions.waterTempC).toBe(20.5);
		expect(conditions.fields.waterTempC?.provider).toBe('ndbc');
	});

	it('takes wind and tide state from CO-OPS when the buoy has no anemometer', () => {
		const conditions = buildCurrentConditions({
			spotId: 'la-jolla-shores',
			bundle: { ndbc: ndbc(), 'coops-obs': coops() },
			now: NOW
		});

		expect(conditions.windSpeedMs).toBe(6.3);
		expect(conditions.windDirDeg).toBe(197);
		expect(conditions.fields.windSpeedMs?.provider).toBe('coops-obs');
		expect(conditions.fields.windDirDeg?.provider).toBe('coops-obs');
		expect(conditions.waterLevelM).toBe(1.949);
		expect(conditions.tideState).toBe('falling');
		expect(conditions.observedAt).toBe('2026-10-11T18:18:00.000Z');
	});

	it('keeps wind speed and direction on the same station', () => {
		const buoyWind = ndbc({
			observedAt: '2026-10-11T18:20:00.000Z',
			windSpeedMs: 4.2,
			windDirDeg: null
		});
		const conditions = buildCurrentConditions({
			spotId: 'la-jolla-shores',
			bundle: { ndbc: buoyWind, 'coops-obs': coops() },
			now: NOW
		});

		// The buoy reading is newer, so both wind fields come from it — the
		// direction is null rather than borrowed from a different station.
		expect(conditions.windSpeedMs).toBe(4.2);
		expect(conditions.fields.windSpeedMs?.provider).toBe('ndbc');
		expect(conditions.windDirDeg).toBeNull();
		expect(conditions.fields.windDirDeg).toBeUndefined();
	});

	it('throws not_found when no source reports anything usable', () => {
		expect(() =>
			buildCurrentConditions({
				spotId: 'catalina-avalon',
				bundle: {
					cdip: { spotId: 'catalina-avalon', stationId: null, observation: null },
					ndbc: { spotId: 'catalina-avalon', stationId: null, observation: null }
				},
				now: NOW
			})
		).toThrowError(ProviderError);
	});
});

describe('current through the provider service', () => {
	it('merges the three adapters into one snapshot with provenance', async () => {
		const spot = spotOrThrow('la-jolla-shores');
		const service = createSpotDataService({
			adapters: [
				createCdipAdapter({
					source: {
						async getLatestWave() {
							return cdip().observation;
						}
					}
				}),
				createNdbcAdapter({
					source: {
						async getLatestObservation() {
							return ndbc().observation;
						}
					}
				}),
				createCoopsObsAdapter({
					source: {
						async getObservations(_stationId, product) {
							if (product === 'water_level') {
								return [
									{ t: '2026-10-11 16:00', v: '2.162' },
									{ t: '2026-10-11 18:18', v: '1.949' }
								];
							}
							if (product === 'water_temperature') {
								return [{ t: '2026-10-11 07:42', v: '21.3' }];
							}
							return [{ t: '2026-10-11 18:12', s: '6.3', d: '197.0' }];
						}
					}
				})
			]
		});

		const window = observationWindow(NOW);
		const envelope = await service.getSpotData(spot, window, {
			providers: ['cdip', 'ndbc', 'coops-obs']
		});
		const conditions = buildCurrentConditions({
			spotId: spot.id,
			bundle: envelope.data as ObservationBundle,
			now: NOW
		});

		expect(envelope.sources.map((source) => source.provider)).toEqual([
			'cdip',
			'ndbc',
			'coops-obs'
		]);
		expect(conditions).toMatchObject({
			waveHeightM: 1.9,
			wavePeriodS: 12,
			waterTempC: 21.5,
			windSpeedMs: 6.3,
			waterLevelM: 1.949,
			tideState: 'falling',
			observedAt: '2026-10-11T18:18:00.000Z'
		});
		expect(Object.keys(conditions.fields).sort()).toEqual([
			'tideState',
			'waterLevelM',
			'waterTempC',
			'waveDirDeg',
			'waveHeightM',
			'wavePeriodS',
			'windDirDeg',
			'windSpeedMs'
		]);
	});
});
