/**
 * `lib/providers/registry.ts` — wires the real adapters onto the shared cache and
 * exposes the endpoint-facing entry points.
 *
 * `providerCache` is the process-wide cache the architecture calls for: one
 * instance, per-adapter TTLs (see `docs/architecture.md`, decision #5). Adding a
 * provider is a one-line change here.
 */
import { TtlCache } from '../cache';
import type { Spot } from '../spots';
import { createGfsWaveAdapter, defaultForecastWindow, type GfsWaveForecast } from './gfswave';
import { SpotDataService } from './service';
import type { DataEnvelope, ForecastWindow } from './types';

/** Process-wide cache shared by every registered adapter (per-adapter TTLs). */
export const providerCache = new TtlCache();

/** The registered adapters. The stub is deliberately not registered. */
export const gfsWaveAdapter = createGfsWaveAdapter();

export const spotDataService = new SpotDataService({
	adapters: [gfsWaveAdapter],
	cache: providerCache
});

export interface GetSpotForecastOptions {
	/** Defaults to `defaultForecastWindow()` (~14 days from now). */
	window?: ForecastWindow;
	forceRefresh?: boolean;
	signal?: AbortSignal;
}

/** Typed alias for the `/forecast` envelope's `data`. */
export type ForecastEnvelope = DataEnvelope<{ gfswave: GfsWaveForecast }>;

/** The forecast the `/api/spot/[id]/forecast` route serves. */
export async function getSpotForecast(
	spot: Spot,
	options: GetSpotForecastOptions = {}
): Promise<ForecastEnvelope> {
	const envelope = await spotDataService.getSpotData(
		spot,
		options.window ?? defaultForecastWindow(),
		{
			providers: ['gfswave'],
			forceRefresh: options.forceRefresh ?? false,
			signal: options.signal
		}
	);
	return envelope as ForecastEnvelope;
}
