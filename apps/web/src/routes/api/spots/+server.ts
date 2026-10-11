import { json } from '@sveltejs/kit';
import { loadSpots } from '../../../lib/spots';
import { getSpotsOverview, toErrorEnvelope } from '../../../lib/providers';
import type { RequestHandler } from './$types';

/**
 * `GET /api/spots` — the curated spot list with a lightweight current snapshot
 * for each, so the dashboard renders without N+1 detail calls
 * (`docs/api-contracts.md`).
 *
 * Per-spot upstream failures degrade that spot to nulls; only a failure that
 * loses the whole list is a `502`.
 */
export const GET: RequestHandler = async ({ setHeaders }) => {
	// The list fans out to every provider for every spot; let the browser reuse a
	// short-lived response rather than re-hitting the process on every navigation.
	setHeaders({ 'cache-control': 'private, max-age=60' });

	try {
		return json(await getSpotsOverview(loadSpots()));
	} catch (cause) {
		const body = toErrorEnvelope(cause);
		return json(body, { status: body.error.code === 'not_found' ? 404 : 502 });
	}
};
