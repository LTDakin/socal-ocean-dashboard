import { describe, expect, it } from 'vitest';
import { PALETTES } from './palette';

describe('PALETTES', () => {
	it('keeps the original ocean colors for dark mode', () => {
		expect(PALETTES.dark).toEqual({
			background: '#04121f',
			surface: '#0a2540',
			border: '#14658c',
			accent: '#4fb3d9',
			foreground: '#e6f4fa'
		});
	});

	it('uses white, black, and the darker ocean blue for light mode', () => {
		expect(PALETTES.light.background).toBe('#ffffff');
		expect(PALETTES.light.foreground).toBe('#111111');
		expect(PALETTES.light.accent).toBe('#14658c');
	});
});
