import { error } from '@sveltejs/kit';
import type {
	ClarityEnvelope,
	CurrentEnvelope,
	ForecastEnvelope,
	TidesEnvelope
} from '../../../lib/providers';
import { buildTidePreview } from '../../../lib/providers/overview';
import { mergeSourceRecords } from '../../../lib/providers/sources';
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
 * four per-spot endpoints. The forecast is the slow one (hundreds of GRIB
 * subsets on a cold cache), so it is returned **unawaited** and SvelteKit streams
 * it: the shell, conditions panel, tide curve and clarity card render as soon as
 * the three cheaper endpoints answer, and the forecast sections fill in when it
 * resolves. `provenance` resolves off the same promise so the footer still
 * merges every source.
 *
 * Each result degrades independently to `{ data: null, error }`, so a single
 * down provider blanks its own card rather than the whole page. The tide curve is
 * decimated here with the tested `buildTidePreview` (3 h step over the 14-day
 * window) so the page hands the chart a compact series.
 */
export const load: PageServerLoad = async ({ params, fetch }) => {
	const spot = getSpot(params.id);
	if (!spot) throw error(404, `No spot found with id "${params.id}".`);

	const now = Date.now();
	const base = `/api/spot/${encodeURIComponent(spot.id)}`;

	// Deliberately not awaited — streamed to the client (see the doc comment).
	const forecast = loadJson<ForecastEnvelope>(fetch, `${base}/forecast`);

	const [tides, current, clarity] = await Promise.all([
		loadJson<TidesEnvelope>(fetch, `${base}/tides`),
		loadJson<CurrentEnvelope>(fetch, `${base}/current`),
		loadJson<ClarityEnvelope>(fetch, `${base}/clarity`)
	]);

	const coops = tides.data?.data.coops ?? null;
	const tidePoints = coops ? buildTidePreview(coops.predictions, coops.window, 3) : [];

	// Merged provenance + staleness, once the streamed forecast settles.
	const provenance = forecast.then((forecastResult) => {
		const sources = mergeSourceRecords([
			...(forecastResult.data?.sources ?? []),
			...(tides.data?.sources ?? []),
			...(current.data?.sources ?? []),
			...(clarity.data?.sources ?? [])
		]);
		return {
			sources,
			stale: sources.some((source) => source.stale),
			generatedAt: forecastResult.data?.data.gfswave?.generatedAt ?? null
		};
	});

	return { spot, now, forecast, provenance, tides, current, clarity, tidePoints };
};
