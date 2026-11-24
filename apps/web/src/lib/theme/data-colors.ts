/**
 * `lib/theme/data-colors.ts` — the fixed palette for data visualization.
 *
 * Unlike the theme roles in `palette.ts`, these colors do not follow the
 * light/dark toggle: the meters and charts deliberately keep their original
 * scales in both themes, and clarity bands use one green→red ramp. This is the
 * one place those hex values are defined; use `withAlpha()` for translucent
 * variants instead of re-typing an `rgba()` literal.
 */

export const DATA_COLORS = {
	/** Cold water, and the low end of the temperature ramp. */
	blue: '#4f9fe0',
	/** Mild water, and excellent visibility (the ramp's green stop). */
	green: '#7fd0c0',
	/** Warm water, and good visibility. */
	yellow: '#ffd479',
	/** Hot water, and fair visibility. */
	orange: '#ff9e5e',
	/** Poor visibility; continues the warm ramp past orange. */
	red: '#f87171',

	/** Extra ramp stops used by the range meters and charts. */
	blueDark: '#2b6f8f',
	cyan: '#4fb3d9',
	cyanLight: '#8fd0e8',
	cyanPale: '#9fe0f5',
	cyanMuted: '#7fb3c9',
	mint: '#7fe0c8',
	lime: '#b8dc8a',
	orangeLight: '#ffb56b',
	indigoDark: '#3d5a9e',
	indigo: '#6b7fd7',
	indigoLight: '#8b9ff0',
	indigoPale: '#a9baf5',

	/** Chart chrome, kept dark in both themes. */
	chartSurface: '#04121f',
	chartText: '#e6f4fa',
	chartLabel: '#a9c7d6'
} as const;

/** CSS `rgba()` string for a palette color at the given opacity. */
export function withAlpha(color: string, opacity: number): string {
	const hex = color.startsWith('#') ? color.slice(1) : color;
	const full = hex.length === 3 ? hex.replace(/./g, (digit) => digit + digit) : hex;
	const r = Number.parseInt(full.slice(0, 2), 16);
	const g = Number.parseInt(full.slice(2, 4), 16);
	const b = Number.parseInt(full.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
