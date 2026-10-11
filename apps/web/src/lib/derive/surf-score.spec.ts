import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeFields } from '../grib2';
import { getSpot } from '../spots';
import { sampleWavePoint } from '../providers/gfswave';
import {
	DEFAULT_SURF_SCORE_CONFIG,
	angleBetweenDeg,
	scoreSurf,
	scoreSurfComponents,
	type SurfScoreInput
} from './surf-score';

const FIXTURES = new URL('../../../fixtures/nomads/', import.meta.url);
const SUBSET = new URL('gfswave.t00z.wcoast.0p16.f000.socal-17field-subset.grib2', FIXTURES);

function input(overrides: Partial<SurfScoreInput> = {}): SurfScoreInput {
	return {
		swellHeightM: 1.5,
		swellPeriodS: 14,
		swellDirectionDeg: 265,
		windSpeedMs: 2,
		windDirectionDeg: 85, // offshore for a west-facing spot
		tideHeightM: null,
		exposureDeg: 265,
		...overrides
	};
}

describe('angleBetweenDeg', () => {
	it('wraps around north and stays within 0..180', () => {
		expect(angleBetweenDeg(350, 10)).toBe(20);
		expect(angleBetweenDeg(10, 350)).toBe(20);
		expect(angleBetweenDeg(0, 180)).toBe(180);
		expect(angleBetweenDeg(90, 90)).toBe(0);
		expect(angleBetweenDeg(265, 265)).toBe(0);
	});
});

describe('scoreSurf component math', () => {
	it('ramps size from minM (0) to idealM (1) and saturates', () => {
		expect(scoreSurfComponents(input({ swellHeightM: 0.3 })).components.size).toBeCloseTo(0, 10);
		expect(scoreSurfComponents(input({ swellHeightM: 3 })).components.size).toBeCloseTo(1, 10);
		expect(scoreSurfComponents(input({ swellHeightM: 6 })).components.size).toBeCloseTo(1, 10);
	});

	it('ramps period from minS (0) to idealS (1)', () => {
		expect(scoreSurfComponents(input({ swellPeriodS: 7 })).components.period).toBeCloseTo(0, 10);
		expect(scoreSurfComponents(input({ swellPeriodS: 18 })).components.period).toBeCloseTo(1, 10);
	});

	it('rewards swell aligned with the spot exposure and zeroes it at 90°+', () => {
		expect(scoreSurfComponents(input({ swellDirectionDeg: 265 })).components.direction).toBeCloseTo(
			1,
			10
		);
		expect(scoreSurfComponents(input({ swellDirectionDeg: 310 })).components.direction).toBeCloseTo(
			0.5,
			10
		);
		expect(scoreSurfComponents(input({ swellDirectionDeg: 355 })).components.direction).toBeCloseTo(
			0,
			10
		);
	});

	it('treats strong offshore wind as best and strong onshore as worst', () => {
		const offshore = scoreSurfComponents(input({ windSpeedMs: 12, windDirectionDeg: 85 }))
			.components.wind;
		const onshore = scoreSurfComponents(input({ windSpeedMs: 12, windDirectionDeg: 265 }))
			.components.wind;
		const calm = scoreSurfComponents(input({ windSpeedMs: 0, windDirectionDeg: 265 })).components
			.wind;
		expect(offshore).toBeCloseTo(1, 10);
		expect(onshore).toBeCloseTo(0, 10);
		// Calm is mildly good even with an onshore direction.
		expect(calm).toBeCloseTo(DEFAULT_SURF_SCORE_CONFIG.wind.calmQuality, 10);
	});

	it('drops missing components and renormalizes the remaining weights', () => {
		// No swell at all → only wind + (direction needs swell dir, so also null).
		const windOnly = scoreSurfComponents(
			input({ swellHeightM: null, swellPeriodS: null, swellDirectionDeg: null })
		);
		expect(windOnly.components.size).toBeNull();
		expect(windOnly.components.period).toBeNull();
		expect(windOnly.components.direction).toBeNull();
		// Score reduces to the wind quality itself.
		expect(windOnly.score).toBeCloseTo((windOnly.components.wind ?? 0) * 10, 10);
	});

	it('returns null when nothing is computable', () => {
		const nothing = scoreSurf({
			swellHeightM: null,
			swellPeriodS: null,
			swellDirectionDeg: null,
			windSpeedMs: null,
			windDirectionDeg: null,
			exposureDeg: null
		});
		expect(nothing).toBeNull();
	});

	it('keeps the weighted score within 0..10', () => {
		const best = scoreSurf(
			input({
				swellHeightM: 3,
				swellPeriodS: 18,
				swellDirectionDeg: 265,
				windSpeedMs: 12,
				windDirectionDeg: 85
			})
		);
		const worst = scoreSurf(
			input({
				swellHeightM: 0.1,
				swellPeriodS: 5,
				swellDirectionDeg: 85,
				windSpeedMs: 15,
				windDirectionDeg: 265
			})
		);
		expect(best).toBeCloseTo(10, 6);
		expect(worst).toBeCloseTo(0, 6);
	});

	it('applies the tide weight only when configured', () => {
		const withTide = {
			...DEFAULT_SURF_SCORE_CONFIG,
			weights: { ...DEFAULT_SURF_SCORE_CONFIG.weights, tide: 0.5 }
		};
		const perfect = scoreSurf(input({ tideHeightM: 1.0 }), withTide);
		const wrong = scoreSurf(input({ tideHeightM: 4.0 }), withTide);
		expect(perfect).toBeGreaterThan(wrong!);
		// Default config ignores tide entirely.
		expect(scoreSurf(input({ tideHeightM: 4.0 }))).toBeCloseTo(
			scoreSurf(input({ tideHeightM: 1.0 }))!,
			10
		);
	});
});

describe('scoreSurf (committed NOMADS fixture)', () => {
	it('yields a deterministic score for the La Jolla offshore point', () => {
		const spot = getSpot('la-jolla-shores');
		if (!spot?.exposureDeg) throw new Error('la-jolla-shores fixture spot missing exposureDeg');

		const fields = decodeFields(new Uint8Array(readFileSync(SUBSET)));
		const point = sampleWavePoint(fields, spot.offshoreModelPoint.lat, spot.offshoreModelPoint.lon);
		if (!point) throw new Error('fixture did not sample a wave point');

		const scoreInput: SurfScoreInput = {
			swellHeightM: point.swellHeightM,
			swellPeriodS: point.swellPeriodS,
			swellDirectionDeg: point.swellDirectionDeg,
			windSpeedMs: point.windSpeedMs,
			windDirectionDeg: point.windDirectionDeg,
			exposureDeg: spot.exposureDeg
		};

		const result = scoreSurfComponents(scoreInput);
		// Swell 0.53 m / 14.23 s from 206.6° at a 265° exposure, 6.4 m·s⁻¹
		// wind from 14° — a small, well-spaced southerly in light offshore wind.
		expect(scoreInput).toMatchObject({
			swellHeightM: expect.closeTo(0.53, 6),
			swellPeriodS: expect.closeTo(14.23, 6),
			swellDirectionDeg: expect.closeTo(206.55, 4),
			windSpeedMs: expect.closeTo(6.36, 6),
			exposureDeg: 265
		});
		expect(result.score).toBeCloseTo(3.777, 3);
		// Every component is present in this rich subset.
		expect(result.components).toMatchObject({
			size: expect.closeTo(0.0852, 3),
			period: expect.closeTo(0.6573, 3),
			direction: expect.closeTo(0.3506, 3),
			wind: expect.closeTo(0.6395, 3),
			tide: null
		});
	});
});
