/**
 * `lib/stores/favorites.svelte.ts` — the shared favorites list.
 *
 * Persisted to `localStorage`; seeded from the spot list's `favoriteSeed` flag
 * on first visit. A rune `$state` array so any component touching `has`/`ids`
 * re-renders when it changes.
 */
import { browser } from '$app/env';
import { loadSpots } from '../spots';
import {
	FAVORITES_STORAGE_KEY,
	parseFavorites,
	serializeFavorites,
	toggleFavorite
} from './persistence';

/** Default favorites: the spots pre-marked in the seed list. */
export function seedFavorites(): string[] {
	return loadSpots()
		.filter((spot) => spot.favoriteSeed)
		.map((spot) => spot.id);
}

function createFavoritesStore() {
	const storage = browser ? window.localStorage : null;
	// Start from the seed so SSR and the first client paint agree; `hydrate`
	// adopts any stored list once mounted.
	let ids = $state<string[]>(seedFavorites());

	/** Adopt the persisted list, if any. Safe to call repeatedly. */
	function hydrate(): void {
		const stored = parseFavorites(storage?.getItem(FAVORITES_STORAGE_KEY));
		if (stored) ids = stored;
	}

	function persist(): void {
		if (!storage) return;
		try {
			storage.setItem(FAVORITES_STORAGE_KEY, serializeFavorites(ids));
		} catch {
			// Private mode / quota: favorites stay in memory for the session.
		}
	}

	return {
		/** Current favorite ids, in insertion order. */
		get ids(): string[] {
			return ids;
		},
		has(id: string): boolean {
			return ids.includes(id);
		},
		toggle(id: string): void {
			ids = toggleFavorite(ids, id);
			persist();
		},
		hydrate
	};
}

/** The shared favorites store (singleton). */
export const favorites = createFavoritesStore();
