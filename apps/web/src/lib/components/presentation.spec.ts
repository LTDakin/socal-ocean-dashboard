import { describe, expect, it } from 'vitest';
import type { ClarityRating } from '../derive';
import { DATA_COLORS } from '../theme/data-colors';
import { clarityBadgeStyle, clarityDotStyle } from './presentation';

const ratings: ClarityRating[] = ['excellent', 'good', 'fair', 'poor'];

describe('clarity styles', () => {
	it('maps bands from green through yellow and orange to red', () => {
		expect(clarityDotStyle('excellent')).toBe(`background-color: ${DATA_COLORS.green}`);
		expect(clarityDotStyle('good')).toBe(`background-color: ${DATA_COLORS.yellow}`);
		expect(clarityDotStyle('fair')).toBe(`background-color: ${DATA_COLORS.orange}`);
		expect(clarityDotStyle('poor')).toBe(`background-color: ${DATA_COLORS.red}`);
	});

	it('uses one theme-independent badge style with a tinted fill', () => {
		expect(clarityBadgeStyle('fair')).toBe(
			'background-color: rgba(255, 158, 94, 0.15); color: var(--color-foam)'
		);
		for (const rating of ratings) {
			expect(clarityBadgeStyle(rating)).toContain('color: var(--color-foam)');
		}
	});
});
