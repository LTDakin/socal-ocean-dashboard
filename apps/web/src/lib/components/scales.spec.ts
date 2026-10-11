import { describe, expect, it } from 'vitest';
import {
	SCALE_BOUNDS,
	SCALE_THEMES,
	scalePosition,
	waterLevelBand,
	waterTempBand,
	wavesBand,
	windBand,
	type ScaleKey
} from './scales';

const KEYS: ScaleKey[] = ['waves', 'waterTemp', 'wind', 'waterLevel'];

describe('scalePosition', () => {
	it('maps the bounds to 0 and 1 and the midpoint to 0.5', () => {
		const { min, max } = SCALE_BOUNDS.waves;
		expect(scalePosition(min, 'waves')).toBe(0);
		expect(scalePosition(max, 'waves')).toBe(1);
		expect(scalePosition((min + max) / 2, 'waves')).toBeCloseTo(0.5);
	});

	it('clamps values beyond either end of the track', () => {
		expect(scalePosition(-5, 'wind')).toBe(0);
		expect(scalePosition(999, 'wind')).toBe(1);
	});

	it('handles non-finite input without throwing', () => {
		expect(scalePosition(Number.NaN, 'waterTemp')).toBe(0);
	});

	it('keeps every metric anchored to its own bounds', () => {
		for (const key of KEYS) {
			expect(scalePosition(SCALE_BOUNDS[key].min, key)).toBe(0);
			expect(scalePosition(SCALE_BOUNDS[key].max, key)).toBe(1);
		}
	});
});

describe('wavesBand', () => {
	it('runs from flat to XXL across the scale', () => {
		expect(wavesBand(0.1)).toBe('Flat');
		expect(wavesBand(1.5)).toBe('Chest');
		expect(wavesBand(4)).toBe('XXL');
	});
});

describe('waterTempBand', () => {
	it('reads cold water as cold and warm water as toasty', () => {
		expect(waterTempBand(11)).toBe('Cold');
		expect(waterTempBand(20)).toBe('Warm');
		expect(waterTempBand(25)).toBe('Toasty');
	});
});

describe('windBand', () => {
	it('reads calm to strong in m/s', () => {
		expect(windBand(0.5)).toBe('Calm');
		expect(windBand(5)).toBe('Moderate');
		expect(windBand(15)).toBe('Strong');
	});
});

describe('waterLevelBand', () => {
	it('splits the tide range into low / mid / high', () => {
		expect(waterLevelBand(SCALE_BOUNDS.waterLevel.min)).toBe('Low');
		expect(waterLevelBand(1)).toBe('Mid');
		expect(waterLevelBand(SCALE_BOUNDS.waterLevel.max)).toBe('High');
	});
});

describe('SCALE_THEMES', () => {
	it('gives every metric an accent and a gradient track', () => {
		for (const key of KEYS) {
			const theme = SCALE_THEMES[key];
			expect(theme.accent).toMatch(/^#[0-9a-f]{6}$/i);
			expect(theme.track).toContain('linear-gradient');
		}
	});
});
