/**
 * `lib/providers/ndbc.ts` — the NDBC buoy-observation adapter.
 *
 * NDBC runs the same SoCal buoys CDIP does and republishes them as plain-text
 * `realtime2/<station>.txt` files (updated ~10 min). Where a CDIP buoy is
 * lagging, its NDBC twin fills the gap with the same physical measurement; the
 * `/current` merge prefers whichever reading is fresher.
 *
 * Linkage is derived from the existing spot model: NDBC names its CDIP-partner
 * buoys with the CDIP station id in parentheses (`"SCRIPPS Nearshore, CA (201)"`
 * → `46254`), so a spot's `cdipBuoyId` resolves through `CDIP_NDBC_TWINS`
 * (see `fixtures/ndbc/activestations.socal.json`). Spots without a twin get no
 * NDBC fallback.
 *
 * `fetch` is injectable (`AGENTS.md` rule 8): tests replay committed fixtures
 * under `fixtures/ndbc/`, never the live API. Units are metric (SI).
 */
import { TtlCache } from '../cache';
import { ProviderError, type ProviderAdapter, type ProviderPayload } from './types';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** NDBC realtime text-file root. */
export const NDBC_REALTIME_URL = 'https://www.ndbc.noaa.gov/data/realtime2';

/**
 * CDIP station id → NDBC station id for the SoCal buoys NDBC republishes.
 * Derived from `activestations.socal.json`, where the twin's name carries the
 * CDIP id in parentheses (`"Torrey Pines Outer, CA (100)"` → `46225`).
 */
export const CDIP_NDBC_TWINS: Readonly<Record<string, string>> = {
	'028': '46221', // Santa Monica Bay
	'045': '46224', // Oceanside Offshore
	'067': '46219', // San Nicolas Island
	'071': '46218', // Harvest
	'092': '46222', // San Pedro
	'100': '46225', // Torrey Pines Outer
	'101': '46273', // Torrey Pines Inner
	'103': '46268', // Topanga Nearshore
	'153': '46266', // Del Mar Nearshore
	'155': '46235', // Imperial Beach Nearshore
	'191': '46232', // Point Loma South
	'201': '46254', // Scripps Nearshore
	'203': '46251', // Santa Cruz Basin
	'213': '46253', // San Pedro South
	'215': '46256', // Long Beach Channel
	'220': '46258', // Mission Bay West
	'222': '46259', // San Elijo Nearshore
	'262': '46274', // Leucadia Nearshore
	'264': '46275', // Red Beach Nearshore
	'271': '46277', // Green Beach Offshore
	'284': '46285' // Capistrano Beach Nearshore
};

export const NDBC_PROVIDER_ID = 'ndbc';
/** Realtime files update ~10 min; match CDIP's 30 min refresh. */
export const NDBC_TTL_MS = 30 * MINUTE_MS;
/** Buoy outage: serve the last good reading for up to 6 h. */
export const NDBC_STALE_TTL_MS = 6 * HOUR_MS;

/** Minimal fetch shape so callers can inject a stub. */
export type NdbcFetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Resolve the NDBC twin for a spot's CDIP buoy, if there is one. */
export function ndbcTwinForCdipBuoy(cdipBuoyId: string | undefined): string | undefined {
	return cdipBuoyId ? CDIP_NDBC_TWINS[cdipBuoyId] : undefined;
}

/** A normalized NDBC buoy observation (SI; missing fields are `null`). */
export interface NdbcObservation {
	/** Upstream observation time, ISO-8601 UTC. */
	observedAt: string;
	/** Significant wave height (WVHT), meters. */
	waveHeightM: number | null;
	/** Dominant wave period (DPD), seconds. */
	wavePeriodS: number | null;
	/** Dominant wave direction (MWD), degrees true. */
	waveDirDeg: number | null;
	/** Sea-surface temperature (WTMP), °C. */
	waterTempC: number | null;
	/** Wind speed (WSPD), m/s. */
	windSpeedMs: number | null;
	/** Wind direction (WDIR), degrees true. */
	windDirDeg: number | null;
}

/** The NDBC payload: the latest twin-buoy reading for one spot, if any. */
export interface NdbcObservations {
	spotId: string;
	/** The resolved NDBC twin, or `null` when the spot has none. */
	stationId: string | null;
	observation: NdbcObservation | null;
}

/** Column positions in an NDBC `realtime2` row. */
const COLUMNS = {
	year: 0,
	month: 1,
	day: 2,
	hour: 3,
	minute: 4,
	windDirDeg: 5,
	windSpeedMs: 6,
	waveHeightM: 8,
	wavePeriodS: 9,
	waveDirDeg: 11,
	waterTempC: 14
} as const;

/** NDBC uses `MM` for missing values. */
function toNumber(value: string | undefined): number | null {
	if (value === undefined || value === '' || value === 'MM') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function toUtcIso(row: readonly string[]): string | null {
	const year = toNumber(row[COLUMNS.year]);
	const month = toNumber(row[COLUMNS.month]);
	const day = toNumber(row[COLUMNS.day]);
	const hour = toNumber(row[COLUMNS.hour]);
	const minute = toNumber(row[COLUMNS.minute]);
	if (year === null || month === null || day === null || hour === null || minute === null) {
		return null;
	}
	return new Date(Date.UTC(year, month - 1, day, hour, minute)).toISOString();
}

/**
 * Parse a `realtime2` file body and return the newest row that carries at least
 * one value we use, or `null` when there are none.
 */
export function parseNdbcRealtime2(body: string): NdbcObservation | null {
	let latest: NdbcObservation | null = null;

	for (const line of body.split('\n')) {
		const trimmed = line.trim();
		if (trimmed === '' || trimmed.startsWith('#')) continue;
		const row = trimmed.split(/\s+/);
		if (row.length < 15) continue;

		const observedAt = toUtcIso(row);
		if (!observedAt) continue;

		const observation: NdbcObservation = {
			observedAt,
			waveHeightM: toNumber(row[COLUMNS.waveHeightM]),
			wavePeriodS: toNumber(row[COLUMNS.wavePeriodS]),
			waveDirDeg: toNumber(row[COLUMNS.waveDirDeg]),
			waterTempC: toNumber(row[COLUMNS.waterTempC]),
			windSpeedMs: toNumber(row[COLUMNS.windSpeedMs]),
			windDirDeg: toNumber(row[COLUMNS.windDirDeg])
		};
		const hasValue = Object.entries(observation).some(
			([key, value]) => key !== 'observedAt' && value !== null
		);
		if (!hasValue) continue;

		if (!latest || observation.observedAt > latest.observedAt) latest = observation;
	}

	return latest;
}

/** Build the realtime2 URL for one station. */
export function buildNdbcRealtimeUrl(stationId: string): string {
	return `${NDBC_REALTIME_URL}/${stationId}.txt`;
}

/** Fetches the latest observation for one NDBC station. */
export interface NdbcSource {
	getLatestObservation(stationId: string): Promise<NdbcObservation | null>;
}

export interface NdbcSourceOptions {
	fetchImpl?: NdbcFetchLike;
	signal?: AbortSignal;
	cache?: TtlCache;
	cacheTtlMs?: number;
}

/** Build the real NDBC source, caching results by full request URL. */
export function createNdbcSource(options: NdbcSourceOptions = {}): NdbcSource {
	const cache = options.cache ?? new TtlCache();
	const cacheTtlMs = options.cacheTtlMs ?? NDBC_TTL_MS;

	return {
		async getLatestObservation(stationId: string): Promise<NdbcObservation | null> {
			const url = buildNdbcRealtimeUrl(stationId);
			const cached = cache.get<NdbcObservation | null>(url);
			if (cached !== undefined) return cached;

			const impl = options.fetchImpl ?? fetch;
			let response: Response;
			try {
				response = await impl(url, options.signal ? { signal: options.signal } : {});
			} catch (cause) {
				throw new ProviderError(`NDBC request failed: ${url}`, { cause });
			}
			if (!response.ok) {
				throw new ProviderError(`NDBC request failed (${response.status}): ${url}`, {
					retryable: response.status >= 500
				});
			}

			const observation = parseNdbcRealtime2(await response.text());
			cache.set(url, observation, cacheTtlMs, 0);
			return observation;
		}
	};
}

export interface NdbcAdapterOptions {
	source?: NdbcSource;
}

/** Build the NDBC adapter that plugs into `getSpotData`. */
export function createNdbcAdapter(
	options: NdbcAdapterOptions = {}
): ProviderAdapter<NdbcObservations> {
	const source = options.source ?? createNdbcSource();

	return {
		id: NDBC_PROVIDER_ID,
		ttlMs: NDBC_TTL_MS,
		staleTtlMs: NDBC_STALE_TTL_MS,
		async fetch({ spot, window }): Promise<ProviderPayload<NdbcObservations>> {
			const stationId = ndbcTwinForCdipBuoy(spot.cdipBuoyId) ?? null;
			if (!stationId) {
				return {
					data: { spotId: spot.id, stationId: null, observation: null },
					asOf: window.start
				};
			}

			const latest = await source.getLatestObservation(stationId);
			// A buoy whose newest row predates the window is not a "now" value.
			const observation = latest && latest.observedAt >= window.start ? latest : null;
			return {
				data: { spotId: spot.id, stationId, observation },
				asOf: observation?.observedAt ?? window.start
			};
		}
	};
}
