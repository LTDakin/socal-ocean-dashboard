/**
 * `lib/theme/palette.ts` — the shared light/dark color roles.
 *
 * `layout.css` keeps the dark values as the SSR/no-JS fallback. Once the
 * preference is known, `applyTheme` writes the active palette to the same CSS
 * custom properties Tailwind's ocean tokens use, so every token-based utility
 * follows the toggle without duplicating class names across components.
 * Charts, meters, and semantic badges read the same `PALETTES` entry for the
 * colors canvas and inline styles cannot get from a CSS class.
 */

export type Theme = 'dark' | 'light';

export interface ThemePalette {
	/** Page background (`--color-abyss`). */
	background: string;
	/** Raised card surface (`--color-deep`). */
	surface: string;
	/** Borders and subtle fills (`--color-sea`). */
	border: string;
	/** Attention color (`--color-surf`). */
	accent: string;
	/** Primary text (`--color-foam`). */
	foreground: string;
}

export const PALETTES: Record<Theme, ThemePalette> = {
	dark: {
		background: '#04121f',
		surface: '#0a2540',
		border: '#14658c',
		accent: '#4fb3d9',
		foreground: '#e6f4fa'
	},
	light: {
		background: '#ffffff',
		surface: '#f5f5f5',
		border: '#111111',
		accent: '#14658c',
		foreground: '#111111'
	}
};

const TOKEN_VARS: Record<keyof ThemePalette, string> = {
	background: '--color-abyss',
	surface: '--color-deep',
	border: '--color-sea',
	accent: '--color-surf',
	foreground: '--color-foam'
};

/** Apply a palette to the document. Safe to call during SSR. */
export function applyTheme(theme: Theme): void {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	root.dataset.theme = theme;
	const palette = PALETTES[theme];
	for (const role of Object.keys(TOKEN_VARS) as (keyof ThemePalette)[]) {
		root.style.setProperty(TOKEN_VARS[role], palette[role]);
	}
}
