import { json } from '@sveltejs/kit';
import { getSpot } from '../../../../../lib/spots';
import { getSpotTides, ProviderError, toErrorEnvelope } from '../../../../../lib/providers';
import type { RequestHandler } from './$types';

/**
 * `GET /api/spot/[id]/tides` — CO-OPS MLLW tide predictions for the spot's
 * station over the forecast window (`docs/api-contracts.md`).
 *
 * Unknown spots are `404`; a spot with no linked station is `404` (not_found);
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
		return json(await getSpotTides(spot));
	} catch (cause) {
		const body = toErrorEnvelope(cause);
		return json(body, { status: body.error.code === 'not_found' ? 404 : 502 });
	}
};
