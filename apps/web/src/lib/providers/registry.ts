/**
 * `lib/providers/registry.ts` — wires the real adapters onto the shared cache and
 * exposes the endpoint-facing entry points.
 *
 * `providerCache` is the process-wide cache the architecture calls for: one
 * instance, per-adapter TTLs (see `docs/architecture.md`, decision #5). Adding a
 * provider is a one-line change here.
 */
import { mapLimit } from '../async/map-limit';
import { TtlCache } from '../cache';
import type { Spot } from '../spots';
import { createCdipAdapter, CDIP_PROVIDER_ID, type CdipObservations } from './cdip';
import {
	clarityWindow,
	createCoastwatchAdapter,
	COASTWATCH_PROVIDER_ID,
	type ClarityObservation
} from './coastwatch';
import { createCoopsAdapter, COOPS_PROVIDER_ID, type CoopsTides } from './coops';
import { createCoopsObsAdapter, COOPS_OBS_PROVIDER_ID, type CoopsObservations } from './coops-obs';
import {
	buildCurrentConditions,
	observationWindow,
	type CurrentConditions,
	type ObservationBundle
} from './current';
import { createGfsWaveAdapter, defaultForecastWindow, type GfsWaveForecast } from './gfswave';
import { createNdbcAdapter, NDBC_PROVIDER_ID, type NdbcObservations } from './ndbc';
import { assembleSpotsOverview, tidePreviewWindow, type SpotOverview } from './overview';
import { SpotDataService } from './service';
import type { DataEnvelope, ForecastWindow } from './types';

/** Process-wide cache shared by every registered adapter (per-adapter TTLs). */
export const providerCache = new TtlCache();

/** The registered adapters. The stub is deliberately not registered. */
export const gfsWaveAdapter = createGfsWaveAdapter();
export const coopsAdapter = createCoopsAdapter();
export const cdipAdapter = createCdipAdapter();
export const ndbcAdapter = createNdbcAdapter();
export const coopsObsAdapter = createCoopsObsAdapter();
export const coastwatchAdapter = createCoastwatchAdapter();

export const spotDataService = new SpotDataService({
	adapters: [
		gfsWaveAdapter,
		coopsAdapter,
		cdipAdapter,
		ndbcAdapter,
		coopsObsAdapter,
		coastwatchAdapter
	],
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

export interface GetSpotTidesOptions {
	/** Defaults to `defaultForecastWindow()` (~14 days from now). */
	window?: ForecastWindow;
	forceRefresh?: boolean;
	signal?: AbortSignal;
}

/** Typed alias for the `/tides` envelope's `data`. */
export type TidesEnvelope = DataEnvelope<{ coops: CoopsTides }>;

/** The tide predictions the `/api/spot/[id]/tides` route serves. */
export async function getSpotTides(
	spot: Spot,
	options: GetSpotTidesOptions = {}
): Promise<TidesEnvelope> {
	const envelope = await spotDataService.getSpotData(
		spot,
		options.window ?? defaultForecastWindow(),
		{
			providers: [COOPS_PROVIDER_ID],
			forceRefresh: options.forceRefresh ?? false,
			signal: options.signal
		}
	);
	return envelope as TidesEnvelope;
}

export interface GetSpotCurrentOptions {
	/** Defaults to `observationWindow(now)` (hour-quantized, 3 h lookback). */
	window?: ForecastWindow;
	/** Injectable clock (epoch ms) for ages/`observedAt`; defaults to `Date.now`. */
	now?: number;
	forceRefresh?: boolean;
	signal?: AbortSignal;
}

/** Typed alias for the `/current` envelope's `data`. */
export type CurrentEnvelope = DataEnvelope<{ current: CurrentConditions }>;

/** The observation providers `/current` merges. */
const OBSERVATION_PROVIDERS = [CDIP_PROVIDER_ID, NDBC_PROVIDER_ID, COOPS_OBS_PROVIDER_ID];

/**
 * The merged "now" snapshot the `/api/spot/[id]/current` route serves: buoy
 * waves (CDIP, gap-filled by NDBC), water temp, wind, water level and tide state,
 * each tagged with the provider/station/observation time behind it.
 */
export async function getSpotCurrent(
	spot: Spot,
	options: GetSpotCurrentOptions = {}
): Promise<CurrentEnvelope> {
	const now = options.now ?? Date.now();
	const envelope = await spotDataService.getSpotData(
		spot,
		options.window ?? observationWindow(now),
		{
			providers: OBSERVATION_PROVIDERS,
			forceRefresh: options.forceRefresh ?? false,
			signal: options.signal
		}
	);

	return {
		ok: true,
		spotId: envelope.spotId,
		asOf: envelope.asOf,
		stale: envelope.stale,
		sources: envelope.sources,
		data: {
			current: buildCurrentConditions({
				spotId: spot.id,
				bundle: envelope.data as ObservationBundle,
				now
			})
		}
	};
}

/** Adapter payload types that make up the `/current` bundle. */
export type CurrentBundle = {
	cdip: CdipObservations;
	ndbc: NdbcObservations;
	'coops-obs': CoopsObservations;
};

export interface GetSpotClarityOptions {
	/** Defaults to `clarityWindow(now)` (day-quantized, 10-day lookback). */
	window?: ForecastWindow;
	/** Injectable clock (epoch ms) for the default window; defaults to `Date.now`. */
	now?: number;
	forceRefresh?: boolean;
	signal?: AbortSignal;
}

/** Typed alias for the `/clarity` envelope's `data`. */
export type ClarityEnvelope = DataEnvelope<{ clarity: ClarityObservation }>;

/**
 * The observed clarity the `/api/spot/[id]/clarity` route serves: the newest
 * cloud-free VIIRS Kd490 pixel at the spot's in-water sample point, with the
 * derived Secchi depth and rating band. It is labeled "observed, not forecast"
 * because the satellite product lags by 2-3 days.
 */
export async function getSpotClarity(
	spot: Spot,
	options: GetSpotClarityOptions = {}
): Promise<ClarityEnvelope> {
	const envelope = await spotDataService.getSpotData(
		spot,
		options.window ?? clarityWindow(options.now),
		{
			providers: [COASTWATCH_PROVIDER_ID],
			forceRefresh: options.forceRefresh ?? false,
			signal: options.signal
		}
	);

	return {
		ok: true,
		spotId: envelope.spotId,
		asOf: envelope.asOf,
		stale: envelope.stale,
		sources: envelope.sources,
		data: { clarity: envelope.data[COASTWATCH_PROVIDER_ID] as ClarityObservation }
	};
}

export interface GetSpotsOverviewOptions {
	/** Injectable clock (epoch ms); defaults to `Date.now`. */
	now?: number;
	signal?: AbortSignal;
	forceRefresh?: boolean;
	/** Max spots fetched concurrently; defaults to 6. */
	concurrency?: number;
}

/**
 * The `/api/spots` envelope. The list endpoint has no single subject, so the
 * per-spot `spotId` field of the standard envelope is omitted.
 */
export type SpotsOverviewEnvelope = Omit<DataEnvelope<{ spots: SpotOverview[] }>, 'spotId'>;

const DEFAULT_OVERVIEW_CONCURRENCY = 6;

/**
 * The dashboard list: every curated spot with a lightweight current snapshot,
 * observed clarity band, and a short tide preview (see
 * `docs/api-contracts.md` → `GET /api/spots`).
 *
 * Per-spot upstream failures degrade that spot to nulls rather than failing the
 * whole list — a dashboard that shows 15 spots and a blank 16th beats a 502.
 */
export async function getSpotsOverview(
	spots: readonly Spot[],
	options: GetSpotsOverviewOptions = {}
): Promise<SpotsOverviewEnvelope> {
	const now = options.now ?? Date.now();
	const window = tidePreviewWindow(now);
	const shared = {
		now,
		forceRefresh: options.forceRefresh ?? false,
		...(options.signal ? { signal: options.signal } : {})
	};

	const entries = await mapLimit(
		spots,
		options.concurrency ?? DEFAULT_OVERVIEW_CONCURRENCY,
		async (spot) => {
			const [current, clarity, tides] = await Promise.all([
				getSpotCurrent(spot, shared).catch(() => null),
				getSpotClarity(spot, shared).catch(() => null),
				getSpotTides(spot, { ...shared, window }).catch(() => null)
			]);
			return {
				spot,
				current: current?.data.current ?? null,
				clarity: clarity?.data.clarity ?? null,
				tides: tides?.data.coops ?? null,
				sources: [
					...(current?.sources ?? []),
					...(clarity?.sources ?? []),
					...(tides?.sources ?? [])
				]
			};
		}
	);

	const overview = assembleSpotsOverview(entries, window, now);

	return {
		ok: true,
		asOf: overview.asOf,
		stale: overview.stale,
		sources: overview.sources,
		data: { spots: overview.spots }
	};
}
