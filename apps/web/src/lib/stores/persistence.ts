/**
 * `lib/stores/persistence.ts` — pure parse/serialize helpers behind the rune
 * stores, kept in a plain `.ts` module so they can be unit-tested without a DOM.
 */

import type { Units } from '../format';

/** `localStorage` key for the favorites list. */
export const FAVORITES_STORAGE_KEY = 'socal-ocean.favorites';
/** `localStorage` key for the units preference. */
export const UNITS_STORAGE_KEY = 'socal-ocean.units';

/**
 * Parse a stored favorites list. Returns `null` (not `[]`) when there is nothing
 * usable persisted, so the caller can distinguish "never set" from "empty" and
 * fall back to the seed.
 */
export function parseFavorites(raw: string | null | undefined): string[] | null {
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return null;
		const ids = parsed.filter((value): value is string => typeof value === 'string');
		return ids;
	} catch {
		return null;
	}
}

/** Serialize a favorites list for storage. */
export function serializeFavorites(ids: readonly string[]): string {
	return JSON.stringify(ids);
}

/** Add `id` if absent, remove it if present. Returns a new array. */
export function toggleFavorite(ids: readonly string[], id: string): string[] {
	return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

/** Parse a stored units preference, or `null` when absent/invalid. */
export function parseUnits(raw: string | null | undefined): Units | null {
	return raw === 'imperial' || raw === 'metric' ? raw : null;
}

/** The other units mode. */
export function alternateUnits(units: Units): Units {
	return units === 'imperial' ? 'metric' : 'imperial';
}
