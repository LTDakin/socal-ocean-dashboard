import { json } from '@sveltejs/kit';
import { getSpot } from '../../../../../lib/spots';
import { getSpotForecast, ProviderError, toErrorEnvelope } from '../../../../../lib/providers';
import type { RequestHandler } from './$types';

/**
 * `GET /api/spot/[id]/forecast` — the core product endpoint.
 *
 * Returns the `ok/asOf/stale/sources/data` envelope (`docs/api-contracts.md`)
 * with the GFS-Wave `hourly[]`/`daily[]` series. Unknown spots are `404`;
 * upstream failures are `502` (the orchestrator has already tried stale cache).
 */
export const GET: RequestHandler = async ({ params }) => {
	const spot = getSpot(params.id);
	if (!spot) {
		return json(
			toErrorEnvelope(
				new ProviderError(`Unknown spot: ${params.id}`, { code: 'not_found', retryable: false })
			),
			{ status: 404 }
		);
	}

	try {
		return json(await getSpotForecast(spot));
	} catch (cause) {
		const body = toErrorEnvelope(cause);
		return json(body, { status: body.error.code === 'not_found' ? 404 : 502 });
	}
};
