import { describe, expect, it } from 'vitest';
import {
	alternateUnits,
	parseFavorites,
	parseUnits,
	serializeFavorites,
	toggleFavorite
} from './persistence';

describe('parseFavorites', () => {
	it('reads a JSON string array', () => {
		expect(parseFavorites('["a","b"]')).toEqual(['a', 'b']);
	});

	it('drops non-string entries', () => {
		expect(parseFavorites('["a",1,null,"b"]')).toEqual(['a', 'b']);
	});

	it('returns null for absent or invalid input', () => {
		expect(parseFavorites(null)).toBeNull();
		expect(parseFavorites('')).toBeNull();
		expect(parseFavorites('{"a":1}')).toBeNull();
		expect(parseFavorites('not json')).toBeNull();
	});

	it('preserves an explicitly empty list', () => {
		expect(parseFavorites('[]')).toEqual([]);
	});
});

describe('serializeFavorites', () => {
	it('round-trips through parseFavorites', () => {
		const ids = ['la-jolla-shores', 'rincon'];
		expect(parseFavorites(serializeFavorites(ids))).toEqual(ids);
	});
});

describe('toggleFavorite', () => {
	it('adds an absent id and removes a present one', () => {
		expect(toggleFavorite(['a'], 'b')).toEqual(['a', 'b']);
		expect(toggleFavorite(['a', 'b'], 'a')).toEqual(['b']);
	});

	it('does not mutate the input', () => {
		const input = ['a'];
		toggleFavorite(input, 'b');
		expect(input).toEqual(['a']);
	});
});

describe('units preference', () => {
	it('accepts only the two known modes', () => {
		expect(parseUnits('imperial')).toBe('imperial');
		expect(parseUnits('metric')).toBe('metric');
		expect(parseUnits('furlongs')).toBeNull();
		expect(parseUnits(null)).toBeNull();
	});

	it('alternates between modes', () => {
		expect(alternateUnits('imperial')).toBe('metric');
		expect(alternateUnits('metric')).toBe('imperial');
	});
});
