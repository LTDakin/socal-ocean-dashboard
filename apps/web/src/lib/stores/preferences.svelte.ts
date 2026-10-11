/**
 * `lib/stores/preferences.svelte.ts` — display preferences (currently units).
 *
 * `imperial` is the default (surfers think in feet/mph); the header toggles it
 * and the choice persists to `localStorage`.
 */
import { browser } from '$app/env';
import type { Units } from '../format';
import { UNITS_STORAGE_KEY, alternateUnits, parseUnits } from './persistence';

function createPreferencesStore() {
	const storage = browser ? window.localStorage : null;
	// SSR paints imperial; `hydrate` adopts the stored preference after mount.
	let units = $state<Units>('imperial');

	/** Adopt the persisted preference, if any. Safe to call repeatedly. */
	function hydrate(): void {
		const stored = parseUnits(storage?.getItem(UNITS_STORAGE_KEY));
		if (stored) units = stored;
	}

	function set(value: Units): void {
		units = value;
		if (!storage) return;
		try {
			storage.setItem(UNITS_STORAGE_KEY, value);
		} catch {
			// Private mode / quota: the preference stays in memory for the session.
		}
	}

	return {
		get units(): Units {
			return units;
		},
		set,
		toggle(): void {
			set(alternateUnits(units));
		},
		hydrate
	};
}

/** The shared preferences store (singleton). */
export const preferences = createPreferencesStore();
