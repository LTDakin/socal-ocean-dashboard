import type { SpotsOverviewEnvelope } from '../lib/providers';
import type { PageServerLoad } from './$types';

/**
 * The dashboard loader calls the `/api/spots` endpoint (`docs/frontend.md`);
 * the page is a pure consumer of that envelope.
 *
 * A total failure still renders the shell with an error state rather than
 * throwing — the spot list itself comes from local seed data.
 */
export const load: PageServerLoad = async ({ fetch }) => {
	const now = Date.now();
	try {
		const response = await fetch('/api/spots');
		if (!response.ok) {
			return {
				overview: null,
				error: `The conditions service is unavailable (HTTP ${response.status}).`,
				now
			};
		}
		const overview = (await response.json()) as SpotsOverviewEnvelope;
		return { overview, error: null, now };
	} catch (cause) {
		return {
			overview: null,
			error: cause instanceof Error ? cause.message : 'Failed to load spot conditions.',
			now
		};
	}
};
