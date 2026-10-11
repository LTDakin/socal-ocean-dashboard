/**
 * `lib/providers/overview.ts` — the `/api/spots` list aggregation.
 *
 * The dashboard needs one cheap row per spot (waves, water temp, wind, tide
 * state, clarity band) and a short tide preview for the card sparkline. Rather
 * than N+1 detail calls, the list endpoint merges the same per-spot services the
 * detail endpoints use — `/current`, `/clarity`, and a 24 h `/tides` window — and
 * flattens them into `docs/api-contracts.md` → `GET /api/spots`.
 *
 * The pure builders here are unit-tested; the fan-out lives in `registry.ts`.
 * All values stay SI — display conversion is `lib/format`.
 */
import type { ClarityRating } from '../derive';
import type { Spot, SpotType } from '../spots';
import type { ClarityObservation } from './coastwatch';
import type { CurrentConditions } from './current';
import type { CoopsTides, TidePrediction } from './coops';
import type { ForecastWindow, SourceRecord } from './types';

const HOUR_MS = 60 * 60 * 1000;

/** How far ahead the card tide preview reaches (hours). */
export const TIDE_PREVIEW_HOURS = 24;
/** Preview curve decimation: keep the hourly curve only every N hours. */
export const TIDE_PREVIEW_STEP_HOURS = 3;

/** One decimated point of the card's tide preview. */
export interface TidePreviewPoint {
	time: string;
	heightM: number;
	/** Set on the exact high/low events; `null` on curve points. */
	highLow: 'high' | 'low' | null;
}

/** The lightweight per-spot snapshot the list renders. All values SI, nullable. */
export interface SpotSnapshot {
	waveHeightM: number | null;
	wavePeriodS: number | null;
	waveDirDeg: number | null;
	waterTempC: number | null;
	windSpeedMs: number | null;
	windDirDeg: number | null;
	waterLevelM: number | null;
	tideState: 'rising' | 'falling' | 'steady' | null;
	/** Latest observed clarity band (lags by 2-3 days). */
	clarityRating: ClarityRating | null;
}

/** One dashboard row: the curated spot plus its current snapshot. */
export interface SpotOverview {
	id: string;
	name: string;
	region: string;
	lat: number;
	lon: number;
	types: SpotType[];
	exposureDeg?: number;
	favoriteSeed?: boolean;
	snapshot: SpotSnapshot;
	/** Newest `/current` field observation, or `null`. */
	observedAt: string | null;
	/** Satellite day behind `clarityRating`, or `null`. */
	clarityObservedAt: string | null;
	/** Short tide preview for the card sparkline, or `null`. */
	tide: { stationId: string; preview: TidePreviewPoint[] } | null;
}

/**
 * Count the dashboard fields that carry a value (0-12). The list sorts by this
 * so spots with real information lead and sparse or unobserved spots trail
 * (`docs/frontend.md`). It is deliberately a presence count, not a quality
 * judgement — a present-but-stale reading still counts.
 */
export function spotInfoScore(spot: SpotOverview): number {
	const snapshot = spot.snapshot;
	let score = 0;
	for (const value of [
		snapshot.waveHeightM,
		snapshot.wavePeriodS,
		snapshot.waveDirDeg,
		snapshot.waterTempC,
		snapshot.windSpeedMs,
		snapshot.windDirDeg,
		snapshot.waterLevelM,
		snapshot.tideState,
		snapshot.clarityRating
	]) {
		if (value !== null) score += 1;
	}
	if (spot.observedAt) score += 1;
	if (spot.clarityObservedAt) score += 1;
	if (spot.tide && spot.tide.preview.length > 0) score += 1;
	return score;
}

/** Sort key: most information first, then alphabetical to break ties. */
export function compareSpotsByInfo(a: SpotOverview, b: SpotOverview): number {
	return spotInfoScore(b) - spotInfoScore(a) || a.name.localeCompare(b.name);
}

/** The preview window: the next `TIDE_PREVIEW_HOURS` from the next hour. */
export function tidePreviewWindow(now: number = Date.now()): ForecastWindow {
	const start = Math.ceil(now / HOUR_MS) * HOUR_MS;
	return {
		start: new Date(start).toISOString(),
		end: new Date(start + TIDE_PREVIEW_HOURS * HOUR_MS).toISOString()
	};
}

/**
 * Decimate a prediction series into a sparkline: every high/low event, plus the
 * hourly curve sampled every `stepHours` (on the hour). Extremes win on a tie so
 * a high that lands on a sampled hour keeps its flag. Clipped to `window`.
 */
export function buildTidePreview(
	predictions: readonly TidePrediction[],
	window: ForecastWindow,
	stepHours: number = TIDE_PREVIEW_STEP_HOURS
): TidePreviewPoint[] {
	const start = Date.parse(window.start);
	const end = Date.parse(window.end);
	const step = Math.max(1, Math.round(stepHours));
	const byTime = new Map<string, TidePreviewPoint>();

	for (const point of predictions) {
		const ms = Date.parse(point.time);
		if (!Number.isFinite(ms) || ms < start || ms > end) continue;
		const onGrid = Math.round(ms / HOUR_MS) % step === 0;
		const existing = byTime.get(point.time);
		if (point.highLow === null) {
			if (!onGrid || existing) continue;
		} else if (existing?.highLow) {
			continue;
		}
		byTime.set(point.time, { time: point.time, heightM: point.heightM, highLow: point.highLow });
	}

	return [...byTime.values()].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

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
