import { describe, expect, it } from 'vitest';
import { DATA_COLORS, withAlpha } from './data-colors';

describe('DATA_COLORS', () => {
	it('defines every color as a six-digit hex value', () => {
		for (const color of Object.values(DATA_COLORS)) {
			expect(color).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it('holds the temperature ramp stops shared with the clarity bands', () => {
		expect(DATA_COLORS.green).toBe('#7fd0c0');
		expect(DATA_COLORS.yellow).toBe('#ffd479');
		expect(DATA_COLORS.orange).toBe('#ff9e5e');
		expect(DATA_COLORS.red).toBe('#f87171');
	});
});

describe('withAlpha', () => {
	it('turns a palette color into an rgba string', () => {
		expect(withAlpha(DATA_COLORS.orange, 0.15)).toBe('rgba(255, 158, 94, 0.15)');
	});
});
