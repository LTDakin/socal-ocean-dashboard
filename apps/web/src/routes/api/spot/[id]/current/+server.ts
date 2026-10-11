import { json } from '@sveltejs/kit';
import { getSpot } from '../../../../../lib/spots';
import { getSpotCurrent, ProviderError, toErrorEnvelope } from '../../../../../lib/providers';
import type { RequestHandler } from './$types';

/**
 * `GET /api/spot/[id]/current` — the merged real-time observation snapshot:
 * buoy waves (CDIP, gap-filled by NDBC), water temperature, wind, water level and
 * tide state, each with per-field provenance (`docs/api-contracts.md`).
 *
 * Unknown spots are `404`; a spot with no source reporting anything usable is
 * `404` (not_found); upstream failures are `502` (the orchestrator has already
 * tried stale cache).
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
		return json(await getSpotCurrent(spot));
	} catch (cause) {
		const body = toErrorEnvelope(cause);
		return json(body, { status: body.error.code === 'not_found' ? 404 : 502 });
	}
};
