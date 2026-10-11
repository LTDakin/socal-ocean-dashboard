import { json } from '@sveltejs/kit';
import { getSpot } from '../../../../../lib/spots';
import { getSpotClarity, ProviderError, toErrorEnvelope } from '../../../../../lib/providers';
import type { RequestHandler } from './$types';

/**
 * `GET /api/spot/[id]/clarity` — the latest observed satellite clarity (VIIRS
 * Kd490 → Secchi depth + rating band) at the spot's in-water sample point
 * (`docs/api-contracts.md`). Labeled **observed, not forecast**: the product
 * lags by 2-3 days.
 *
 * Unknown spots are `404`; upstream failures are `502` (the orchestrator has
 * already tried stale cache). A valid spot with an all-cloud lookback is
 * `200` with a null observation, not an error.
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
		return json(await getSpotClarity(spot));
	} catch (cause) {
		const body = toErrorEnvelope(cause);
		return json(body, { status: body.error.code === 'not_found' ? 404 : 502 });
	}
};
