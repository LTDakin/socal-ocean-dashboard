/**
 * `lib/dashboard/types.ts` — wire shapes shared by the BFF and the browser.
 *
 * These are plain data (no adapters, no fetch), so they live in `lib/` while the
 * providers that produce them live in `server/`. A component may import these
 * shapes and the pure helpers beside them without pulling upstream code into the
 * client bundle. Shapes mirror `docs/api-contracts.md`; keep them in sync.
 */
import type { ClarityRating } from '../derive';
import type { SpotType } from '../spots';

/** Inclusive time window a provider is asked to cover. ISO-8601 UTC instants. */
export interface ForecastWindow {
	/** Window start (inclusive), e.g. `2026-10-11T00:00:00Z`. */
	start: string;
	/** Window end (inclusive). */
	end: string;
}

/** A normalized MLLW prediction point (`docs/api-contracts.md` → `/tides`). */
export interface TidePrediction {
	/** ISO-8601 UTC instant. */
	time: string;
	/** Predicted water level relative to MLLW, in meters. */
	heightM: number;
	/** Set on the exact high/low events; `null` on hourly curve points. */
	highLow: 'high' | 'low' | null;
}

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
