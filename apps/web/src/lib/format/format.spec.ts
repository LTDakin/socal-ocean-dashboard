import { describe, expect, it } from 'vitest';
import {
	NO_VALUE,
	celsiusToFahrenheit,
	formatClockTime,
	formatDayLabel,
	formatFullDate,
	formatHeight,
	formatRelativeTime,
	formatSpeed,
	formatSwell,
	formatTemperature,
	formatWaterLevel,
	metersToFeet,
	ordinalDirection,
	regionLabel,
	tideStateArrow,
	titleCase
} from './index';

describe('unit conversion', () => {
	it('converts meters to feet and Celsius to Fahrenheit', () => {
		expect(metersToFeet(1)).toBeCloseTo(3.2808, 3);
		expect(celsiusToFahrenheit(0)).toBe(32);
		expect(celsiusToFahrenheit(21.5)).toBeCloseTo(70.7, 1);
	});
});

describe('formatHeight', () => {
	it('renders feet for imperial and meters for metric', () => {
		expect(formatHeight(1, 'imperial')).toBe('3.3 ft');
		expect(formatHeight(1, 'metric')).toBe('1 m');
	});

	it('returns the no-value placeholder when missing', () => {
		expect(formatHeight(null, 'imperial')).toBe(NO_VALUE);
		expect(formatHeight(undefined, 'metric')).toBe(NO_VALUE);
	});
});

describe('formatWaterLevel', () => {
	it('signs non-zero levels', () => {
		expect(formatWaterLevel(0.9, 'metric')).toBe('+0.9 m');
		expect(formatWaterLevel(-0.4, 'metric')).toBe('-0.4 m');
	});
});

describe('formatTemperature / formatSpeed', () => {
	it('formats temperature per units', () => {
		expect(formatTemperature(20, 'metric')).toBe('20 °C');
		expect(formatTemperature(20, 'imperial')).toBe('68 °F');
	});

	it('rounds wind speed to whole units', () => {
		expect(formatSpeed(6.3, 'metric')).toBe('23 km/h');
		expect(formatSpeed(6.3, 'imperial')).toBe('14 mph');
	});
});

describe('ordinalDirection', () => {
	it('maps bearings onto the 16-point compass', () => {
		expect(ordinalDirection(0)).toBe('N');
		expect(ordinalDirection(90)).toBe('E');
		expect(ordinalDirection(247.5)).toBe('WSW');
		expect(ordinalDirection(359)).toBe('N');
		expect(ordinalDirection(null)).toBe(NO_VALUE);
	});
});

describe('formatSwell', () => {
	it('composes height, period, and direction', () => {
		expect(formatSwell(1, 12, 265, 'imperial')).toBe('3.3 ft @ 12 s W');
	});

	it('degrades when parts are missing', () => {
		expect(formatSwell(1, null, null, 'metric')).toBe('1 m');
		expect(formatSwell(null, 12, 265, 'imperial')).toBe(NO_VALUE);
	});
});

describe('titleCase / regionLabel', () => {
	it('title-cases slugs', () => {
		expect(titleCase('san-diego')).toBe('San Diego');
		expect(titleCase(null)).toBe(NO_VALUE);
	});

	it('uses friendly region labels', () => {
		expect(regionLabel('orange')).toBe('Orange County');
		expect(regionLabel('unknown-region')).toBe('Unknown Region');
	});
});

describe('tideStateArrow', () => {
	it('maps tide trends to arrows', () => {
		expect(tideStateArrow('rising')).toBe('↑');
		expect(tideStateArrow('falling')).toBe('↓');
		expect(tideStateArrow('steady')).toBe('→');
		expect(tideStateArrow(null)).toBe(NO_VALUE);
	});
});

describe('day labels', () => {
	it('formats a date bucket and an ISO instant in UTC', () => {
		expect(formatDayLabel('2026-10-11')).toBe('Sun 11');
		expect(formatDayLabel('2026-10-11T23:00:00Z')).toBe('Sun 11');
		expect(formatFullDate('2026-10-11')).toBe('Sun Oct 11');
	});

	it('returns the no-value placeholder for bad input', () => {
		expect(formatDayLabel(null)).toBe(NO_VALUE);
		expect(formatFullDate('not-a-date')).toBe(NO_VALUE);
	});
});

describe('formatClockTime', () => {
	it('formats an ISO instant as UTC HH:MM', () => {
		expect(formatClockTime('2026-10-11T18:00:00Z')).toBe('18:00');
		expect(formatClockTime('2026-10-11T05:07:00Z')).toBe('05:07');
		expect(formatClockTime(null)).toBe(NO_VALUE);
	});
});

describe('formatRelativeTime', () => {
	const now = Date.parse('2026-10-11T18:00:00Z');

	it('describes the recent past', () => {
		expect(formatRelativeTime('2026-10-11T18:00:00Z', now)).toBe('just now');
		expect(formatRelativeTime('2026-10-11T17:30:00Z', now)).toBe('30 min ago');
		expect(formatRelativeTime('2026-10-11T14:00:00Z', now)).toBe('4 hr ago');
		expect(formatRelativeTime('2026-10-09T18:00:00Z', now)).toBe('2 d ago');
	});

	it('describes the near future', () => {
		expect(formatRelativeTime('2026-10-11T21:00:00Z', now)).toBe('in 3 hr');
	});

	it('handles missing and invalid input', () => {
		expect(formatRelativeTime(null, now)).toBe(NO_VALUE);
		expect(formatRelativeTime('not-a-date', now)).toBe(NO_VALUE);
	});
});
