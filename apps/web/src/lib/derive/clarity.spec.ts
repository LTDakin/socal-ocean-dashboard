import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	CLARITY_BANDS,
	SECCHI_KD_COEFFICIENT,
	clarityRating,
	deriveClarity,
	secchiDepthM,
	type ClarityRating
} from './clarity';

const FIXTURE = new URL(
	'../../../fixtures/coastwatch/nesdisVHNkd490Daily.lajolla.2026-10-08.json',
	import.meta.url
);

/** The committed CoastWatch `Kd490` value at La Jolla (m⁻¹). */
function fixtureKd490(): number {
	const table = JSON.parse(readFileSync(FIXTURE, 'utf8'));
	return table.table.rows[0][4];
}

describe('secchiDepthM', () => {
	it('applies Kirk: ZSD = 1.44 / Kd490', () => {
		expect(secchiDepthM(1.44)).toBeCloseTo(1, 10);
		expect(secchiDepthM(0.5)).toBeCloseTo(2.88, 10);
	});

	it('returns null for missing, non-finite, or non-positive Kd490', () => {
		expect(secchiDepthM(null)).toBeNull();
		expect(secchiDepthM(undefined)).toBeNull();
		expect(secchiDepthM(Number.NaN)).toBeNull();
		expect(secchiDepthM(Number.POSITIVE_INFINITY)).toBeNull();
		expect(secchiDepthM(0)).toBeNull();
		expect(secchiDepthM(-0.03)).toBeNull();
	});
});

describe('clarityRating', () => {
	it('maps the band boundaries inclusively from the lower edge', () => {
		expect(clarityRating(0)).toBe('poor');
		expect(clarityRating(4.99)).toBe('poor');
		expect(clarityRating(5)).toBe('fair');
		expect(clarityRating(9.99)).toBe('fair');
		expect(clarityRating(10)).toBe('good');
		expect(clarityRating(19.99)).toBe('good');
		expect(clarityRating(20)).toBe('excellent');
		expect(clarityRating(1000)).toBe('excellent');
	});

	it('returns null for unrateable input', () => {
		expect(clarityRating(null)).toBeNull();
		expect(clarityRating(Number.NaN)).toBeNull();
		expect(clarityRating(-1)).toBeNull();
	});

	it('lists bands from clearest to murkiest', () => {
		const ratings = CLARITY_BANDS.map((band) => band.rating);
		expect(ratings).toEqual(['excellent', 'good', 'fair', 'poor']);
		const minimums = CLARITY_BANDS.map((band) => band.minSecchiM);
		expect(minimums).toEqual([...minimums].sort((a, b) => b - a));
	});
});

describe('deriveClarity (committed CoastWatch fixture)', () => {
	it('yields a deterministic Secchi depth and "excellent" rating', () => {
		const kd490 = fixtureKd490();
		expect(kd490).toBeCloseTo(0.03424, 6);

		const summary = deriveClarity(kd490);
		expect(summary.kd490).toBeCloseTo(0.03424, 6);
		expect(summary.secchiDepthM).toBeCloseTo(SECCHI_KD_COEFFICIENT / 0.03424, 6);
		// ≈ 42.06 m in clear offshore water.
		expect(summary.secchiDepthM).toBeCloseTo(42.056, 3);
		const rating: ClarityRating = 'excellent';
		expect(summary.rating).toBe(rating);
	});

	it('keeps a missing observation fully null rather than "poor"', () => {
		expect(deriveClarity(null)).toEqual({ kd490: null, secchiDepthM: null, rating: null });
		expect(deriveClarity(Number.NaN)).toEqual({ kd490: null, secchiDepthM: null, rating: null });
	});
});
