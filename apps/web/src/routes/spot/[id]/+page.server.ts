import { error } from '@sveltejs/kit';
import type {
	ClarityEnvelope,
	CurrentEnvelope,
	ForecastEnvelope,
	TidesEnvelope
} from '../../../lib/providers';
import { buildTidePreview } from '../../../lib/providers/overview';
import { getSpot } from '../../../lib/spots';
import type { PageServerLoad } from './$types';

/** One detail endpoint's result: the envelope, or why it couldn't be fetched. */
interface Loaded<T> {
	data: T | null;
	error: string | null;
}

async function loadJson<T>(fetchImpl: typeof globalThis.fetch, url: string): Promise<Loaded<T>> {
	try {
		const response = await fetchImpl(url);
		if (!response.ok) return { data: null, error: `HTTP ${response.status}` };
		return { data: (await response.json()) as T, error: null };
	} catch (cause) {
		return { data: null, error: cause instanceof Error ? cause.message : 'Request failed' };
	}
}

/**
 * The spot detail loader (`docs/frontend.md`): resolve the spot, then call the
 * four per-spot endpoints (`/forecast`, `/tides`, `/current`, `/clarity`) in
 * parallel. Each result degrades independently to `{ data: null, error }`, so a
 * single down provider blanks its own card rather than the whole page.
 *
 * The tide curve is decimated here with the tested `buildTidePreview` (3 h step
 * over the 14-day window) so the page hands the chart a compact series.
 */
export const load: PageServerLoad = async ({ params, fetch }) => {
	const spot = getSpot(params.id);
	if (!spot) throw error(404, `No spot found with id "${params.id}".`);

	const now = Date.now();
	const base = `/api/spot/${encodeURIComponent(spot.id)}`;
	const [forecast, tides, current, clarity] = await Promise.all([
		loadJson<ForecastEnvelope>(fetch, `${base}/forecast`),
		loadJson<TidesEnvelope>(fetch, `${base}/tides`),
		loadJson<CurrentEnvelope>(fetch, `${base}/current`),
		loadJson<ClarityEnvelope>(fetch, `${base}/clarity`)
	]);

	const coops = tides.data?.data.coops ?? null;
	const tidePoints = coops ? buildTidePreview(coops.predictions, coops.window, 3) : [];

	return { spot, now, forecast, tides, current, clarity, tidePoints };
};
