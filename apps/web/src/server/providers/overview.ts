/**
 * `server/providers/overview.ts` — the `/api/spots` list aggregation.
 *
 * The dashboard needs one cheap row per spot (waves, water temp, wind, tide
 * state, clarity) and a short tide preview for the card sparkline. Rather
 * than N+1 detail calls, the list endpoint merges the same per-spot services the
 * detail endpoints use — `/current`, `/clarity`, and a 24 h `/tides` window — and
 * flattens them into `docs/api-contracts.md` → `GET /api/spots`.
 *
 * The row shape and the pure tide-preview / ranking helpers live in
 * `lib/dashboard` so the browser can use them without importing BFF code. The
 * fan-out lives in `registry.ts`. All values stay SI — display conversion is
 * `lib/format`.
 */
import { buildTidePreview, type SpotOverview } from '../../lib/dashboard';
import type { Spot } from '../../lib/spots';
import type { ClarityObservation } from './coastwatch';
import type { CurrentConditions } from './current';
import type { CoopsTides } from './coops';
import type { ForecastWindow, SourceRecord } from './types';

/** Flatten one spot's services into a dashboard row. */
export function buildSpotOverview(params: {
	spot: Spot;
	current: CurrentConditions | null;
	clarity: ClarityObservation | null;
	tides: CoopsTides | null;
	window: ForecastWindow;
}): SpotOverview {
	const { spot, current, clarity, tides, window } = params;
	return {
		id: spot.id,
		name: spot.name,
		region: spot.region,
		lat: spot.lat,
		lon: spot.lon,
		types: spot.types,
		...(spot.exposureDeg !== undefined ? { exposureDeg: spot.exposureDeg } : {}),
		...(spot.favoriteSeed !== undefined ? { favoriteSeed: spot.favoriteSeed } : {}),
		snapshot: {
			waveHeightM: current?.waveHeightM ?? null,
			wavePeriodS: current?.wavePeriodS ?? null,
			waveDirDeg: current?.waveDirDeg ?? null,
			waterTempC: current?.waterTempC ?? null,
			windSpeedMs: current?.windSpeedMs ?? null,
			windDirDeg: current?.windDirDeg ?? null,
			waterLevelM: current?.waterLevelM ?? null,
			tideState: current?.tideState ?? null,
			clarityRating: clarity?.rating ?? null
		},
		observedAt: current?.observedAt ?? null,
		clarityObservedAt: clarity?.observedAt ?? null,
		tide: tides
			? { stationId: tides.stationId, preview: buildTidePreview(tides.predictions, window) }
			: null
	};
}

/** One spot's three service results plus their provenance. */
export interface SpotOverviewEntry {
	spot: Spot;
	current: CurrentConditions | null;
	clarity: ClarityObservation | null;
	tides: CoopsTides | null;
	sources: readonly SourceRecord[];
}

/** The `data` half of the `/api/spots` envelope. */
export interface SpotsOverviewData {
	spots: SpotOverview[];
	asOf: string;
	stale: boolean;
	sources: SourceRecord[];
}

/**
 * Assemble the list envelope from per-spot results.
 *
 * Provenance is collapsed to one entry per provider (newest `asOf`, `stale` =
 * any) so a 16-spot payload isn't 60 near-identical source records. `asOf` is
 * the newest source vintage; it falls back to `now` when nothing answered.
 */
export function assembleSpotsOverview(
	entries: readonly SpotOverviewEntry[],
	window: ForecastWindow,
	now: number = Date.now()
): SpotsOverviewData {
	const sources = new Map<string, SourceRecord>();
	let stale = false;

	for (const entry of entries) {
		for (const source of entry.sources) {
			if (source.stale) stale = true;
			const existing = sources.get(source.provider);
			if (!existing || source.asOf > existing.asOf) sources.set(source.provider, source);
		}
	}

	const ranked = [...sources.values()].sort((a, b) => (a.provider < b.provider ? -1 : 1));
	let asOf = ranked.length > 0 ? ranked[0].asOf : new Date(now).toISOString();
	for (const source of ranked) if (source.asOf > asOf) asOf = source.asOf;

	return {
		spots: entries.map((entry) =>
			buildSpotOverview({
				spot: entry.spot,
				current: entry.current,
				clarity: entry.clarity,
				tides: entry.tides,
				window
			})
		),
		asOf,
		stale,
		sources: ranked
	};
}
