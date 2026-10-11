/**
 * `lib/providers/prewarm.ts` — populate the process cache at server boot.
 *
 * `docs/architecture.md` calls for a pre-warm so the first visitor is never
 * cold: a cold `/api/spots` fans out to every provider for every spot (~18 s
 * measured), and a cold detail load fetches ~188 NOMADS subsets (~8 s). Warming
 * the overview covers the dashboard; warming a single forecast fills the GRIB
 * field cache, which is shared across spots, so every other detail load becomes
 * cheap.
 *
 * Best-effort: a failure is logged and swallowed. Pre-warm must never prevent
 * the server from serving.
 */
import type { Spot } from '../spots';
import { loadSpots } from '../spots';
import { getSpotForecast, getSpotsOverview } from './registry';

export interface PrewarmOptions {
	/** Spots to warm; defaults to the curated seed list. */
	spots?: readonly Spot[];
	/** Overview warmer; defaults to the real `getSpotsOverview`. */
	warmOverview?: (spots: readonly Spot[]) => Promise<unknown>;
	/** Forecast warmer; defaults to the real `getSpotForecast`. */
	warmForecast?: (spot: Spot) => Promise<unknown>;
	/** Progress sink; defaults to `console.info`. */
	log?: (message: string) => void;
}

export interface PrewarmResult {
	/** How many spots the overview warmed (0 when it failed). */
	overviewSpots: number;
	/** The spot whose forecast was warmed, or `null` when none was. */
	forecastSpotId: string | null;
}

/** Warm the dashboard overview, then one forecast (fills the shared GRIB cache). */
export async function prewarmProviderCache(options: PrewarmOptions = {}): Promise<PrewarmResult> {
	const spots = options.spots ?? loadSpots();
	const warmOverview = options.warmOverview ?? ((list: readonly Spot[]) => getSpotsOverview(list));
	const warmForecast = options.warmForecast ?? ((spot: Spot) => getSpotForecast(spot));
	const log = options.log ?? ((message: string) => console.info(message));

	const result: PrewarmResult = { overviewSpots: 0, forecastSpotId: null };
	if (spots.length === 0) return result;

	try {
		await warmOverview(spots);
		result.overviewSpots = spots.length;
	} catch (cause) {
		log(`[prewarm] overview failed: ${describe(cause)}`);
	}

	try {
		await warmForecast(spots[0]);
		result.forecastSpotId = spots[0].id;
	} catch (cause) {
		log(`[prewarm] forecast failed: ${describe(cause)}`);
	}

	return result;
}

function describe(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}
