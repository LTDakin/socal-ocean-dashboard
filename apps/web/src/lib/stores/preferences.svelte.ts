/**
 * `lib/stores/preferences.svelte.ts` — display preferences (units and theme).
 *
 * Imperial and dark are the seed defaults, so SSR always paints a known state.
 * `hydrate` adopts stored preferences after mount, matching the server markup
 * until the client has the saved values.
 */
import { browser } from '$app/env';
import type { Units } from '../format';
import type { Theme } from '../theme/palette';
import {
	UNITS_STORAGE_KEY,
	THEME_STORAGE_KEY,
	alternateTheme,
	alternateUnits,
	parseTheme,
	parseUnits
} from './persistence';

function createPreferencesStore() {
	const storage = browser ? window.localStorage : null;
	let units = $state<Units>('imperial');
	let theme = $state<Theme>('dark');

	function save(key: string, value: string): void {
		if (!storage) return;
		try {
			storage.setItem(key, value);
		} catch {
			// Private mode / quota: the preference stays in memory for the session.
		}
	}

	/** Adopt persisted preferences, if any. Safe to call repeatedly. */
	function hydrate(): void {
		const storedUnits = parseUnits(storage?.getItem(UNITS_STORAGE_KEY));
		if (storedUnits) units = storedUnits;
		const storedTheme = parseTheme(storage?.getItem(THEME_STORAGE_KEY));
		if (storedTheme) theme = storedTheme;
	}

	function set(value: Units): void {
		units = value;
		save(UNITS_STORAGE_KEY, value);
	}

	function setTheme(value: Theme): void {
		theme = value;
		save(THEME_STORAGE_KEY, value);
	}

	return {
		get units(): Units {
			return units;
		},
		get theme(): Theme {
			return theme;
		},
		set,
		toggle(): void {
			set(alternateUnits(units));
		},
		setTheme,
		toggleTheme(): void {
			setTheme(alternateTheme(theme));
		},
		hydrate
	};
}

/** The shared preferences store (singleton). */
export const preferences = createPreferencesStore();
