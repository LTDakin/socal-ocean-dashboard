/**
 * `lib/providers/coastwatch.ts` — the NOAA CoastWatch VIIRS Kd490 clarity
 * adapter.
 *
 * There is no forecast for underwater visibility, so this adapter reads the
 * latest *observed* satellite product: VIIRS NRT Kd490 (diffuse attenuation at
 * 490 nm) on the CoastWatch ERDDAP, a daily global 4 km Level-3 grid with a 2–3
 * day latency and frequent cloud gaps (see `docs/data-sources.md`).
 *
 * The satellite row is one value per day at 12:00Z; a cloudy day comes back as
 * ERDDAP's `_FillValue` (`null`/`NaN`). The adapter searches a short lookback in
 * one griddap call and keeps the newest cloud-free pixel. Secchi depth and the
 * rating band are derived in `lib/derive/clarity` — this file only fetches.
 *
 * `fetch` is injectable (`AGENTS.md` rule 8): tests and CI replay committed
 * fixtures under `fixtures/coastwatch/`, never the live API.
 */
import { TtlCache } from '../cache';
import { deriveClarity, type ClarityRating } from '../derive';
import {
	ProviderError,
	type ForecastWindow,
	type ProviderAdapter,
	type ProviderPayload
} from './types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** CoastWatch ERDDAP root (griddap served from here). */
export const COASTWATCH_ERDDAP_URL = 'https://coastwatch.pfeg.noaa.gov/erddap';
/** VIIRS (S-NPP) NRT, daily global 4 km Kd490. */
export const COASTWATCH_KD490_DATASET = 'nesdisVHNkd490Daily';
/** The attenuation coefficient variable (m⁻¹). */
export const COASTWATCH_KD490_VARIABLE = 'kd_490';

export const COASTWATCH_PROVIDER_ID = 'coastwatch';
/** The product is daily; refresh once a day per `docs/data-sources.md`. */
export const COASTWATCH_TTL_MS = 24 * HOUR_MS;
/** Serve the last good pixel for a week while upstream is unavailable. */
export const COASTWATCH_STALE_TTL_MS = 7 * DAY_MS;

/** How many days back the adapter searches for a cloud-free pixel. */
export const CLARITY_LOOKBACK_DAYS = 10;

/** The daily VIIRS composite's timestamp-of-day (UTC). */
const KD490_SAMPLE_TIME = 'T12:00:00Z';

/** Minimal fetch shape so callers can inject a stub. */
export type CoastwatchFetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** A 4 km satellite pixel location (degrees). */
export interface PixelLocation {
	lat: number;
	lon: number;
}

/** One cloud-free Kd490 observation at a spot's sample point. */
export interface Kd490Observation {
	/** Satellite day, ISO-8601 UTC (the daily composite's 12:00Z timestamp). */
	observedAt: string;
	/** Diffuse attenuation at 490 nm, m⁻¹ (finite, strictly positive). */
	kd490: number;
	/** The nearest grid cell actually read. */
	pixel: PixelLocation;
}

/** The `/clarity` payload: observed satellite clarity + derived Secchi/rating. */
export interface ClarityObservation {
	spotId: string;
	/** Satellite day, ISO-8601 UTC; `null` when the lookback was all cloud. */
	observedAt: string | null;
	/** Observed Kd490 (m⁻¹), or `null` when unobserved. */
	kd490: number | null;
	/** Secchi depth (m) derived via Kirk, or `null`. */
	secchiDepthM: number | null;
	/** Coarse visibility band, or `null`. */
	rating: ClarityRating | null;
	/** The 4 km cell behind the value, or `null` when unobserved. */
	pixel: PixelLocation | null;
}

/**
 * The clarity search window: `CLARITY_LOOKBACK_DAYS` back from the next UTC
 * midnight.
 *
 * Quantizing to the day keeps the cache key stable across requests in the same
 * day, matching the product's daily cadence and ~24 h TTL.
 */
export function clarityWindow(now: number = Date.now()): ForecastWindow {
	const endMs = Math.ceil(now / DAY_MS) * DAY_MS;
	return {
		start: new Date(endMs - CLARITY_LOOKBACK_DAYS * DAY_MS).toISOString(),
		end: new Date(endMs).toISOString()
	};
}

/** The data grid's `time` value nearest a day: its date at the composite hour. */
function toSampleTime(iso: string): string {
	return `${iso.slice(0, 10)}${KD490_SAMPLE_TIME}`;
}

/**
 * Build the ERDDAP griddap URL for a lookback at one point.
 *
 * `[(start):1:last]` is a time *range* whose end is the axis maximum, so a
 * lookback that reaches past the latest available day clamps instead of erroring
 * (values are the daily 12:00Z timestamps). `[(0.0)]` pins the single altitude
 * level; latitude/longitude select the nearest cell.
 */
export function buildCoastwatchKd490Url(params: {
	lat: number;
	lon: number;
	start: string;
}): string {
	const start = toSampleTime(params.start);
	const constraint = `${COASTWATCH_KD490_VARIABLE}[(${start}):1:last][(0.0)][(${params.lat})][(${params.lon})]`;
	return `${COASTWATCH_ERDDAP_URL}/griddap/${COASTWATCH_KD490_DATASET}.json?${constraint}`;
}

interface ErddapGridJson {
	table?: { columnNames?: string[]; rows?: unknown[][] };
}

function toNumber(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function toIso(value: unknown): string | null {
	if (typeof value !== 'string' || value.trim() === '') return null;
	const ms = Date.parse(value);
	return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Read ERDDAP's `{ table: { columnNames, rows } }` shape and return the newest
 * row with a usable (finite, strictly positive) Kd490 — skipping cloud gaps —
 * or `null` when every row is missing.
 */
export function parseCoastwatchKd490(body: string, context: string): Kd490Observation | null {
	let parsed: ErddapGridJson;
	try {
		parsed = JSON.parse(body) as ErddapGridJson;
	} catch (cause) {
		throw new ProviderError(`CoastWatch returned non-JSON for ${context}`, { cause });
	}

	const columns = parsed.table?.columnNames;
	const rows = parsed.table?.rows;
	if (!columns || !rows) return null;

	const index = new Map(columns.map((name, position) => [name, position]));
	const cell = (row: unknown[], column: string): unknown => {
		const position = index.get(column);
		return position === undefined ? undefined : row[position];
	};

	let latest: Kd490Observation | null = null;
	for (const row of rows) {
		const observedAt = toIso(cell(row, 'time'));
		const kd490 = toNumber(cell(row, COASTWATCH_KD490_VARIABLE));
		const lat = toNumber(cell(row, 'latitude'));
		const lon = toNumber(cell(row, 'longitude'));
		// `_FillValue` (NaN) serializes as null; a zero/negative pixel is not
		// real clarity either.
		if (!observedAt || kd490 === null || kd490 <= 0 || lat === null || lon === null) continue;
		const observation: Kd490Observation = { observedAt, kd490, pixel: { lat, lon } };
		if (!latest || observation.observedAt > latest.observedAt) latest = observation;
	}
	return latest;
}

/** ERDDAP signals an empty result set as a 404 with this message. */
function isEmptyResult(body: string): boolean {
	return /no matching results/i.test(body);
}

/** Fetches the latest cloud-free Kd490 observation at one point. */
export interface CoastwatchSource {
	getLatestKd490(point: PixelLocation, start: string): Promise<Kd490Observation | null>;
}

export interface CoastwatchSourceOptions {
	fetchImpl?: CoastwatchFetchLike;
	signal?: AbortSignal;
	cache?: TtlCache;
	cacheTtlMs?: number;
}

/** Build the real ERDDAP source, caching results by full request URL. */
export function createCoastwatchSource(options: CoastwatchSourceOptions = {}): CoastwatchSource {
	const cache = options.cache ?? new TtlCache();
	const cacheTtlMs = options.cacheTtlMs ?? COASTWATCH_TTL_MS;

	return {
		async getLatestKd490(point: PixelLocation, start: string): Promise<Kd490Observation | null> {
			const url = buildCoastwatchKd490Url({ lat: point.lat, lon: point.lon, start });
			const cached = cache.get<Kd490Observation | null>(url);
			if (cached !== undefined) return cached;

			const impl = options.fetchImpl ?? fetch;
			let response: Response;
			try {
				response = await impl(url, options.signal ? { signal: options.signal } : {});
			} catch (cause) {
				throw new ProviderError(`CoastWatch request failed: ${url}`, { cause });
			}

			const body = await response.text();
			if (!response.ok) {
				// A lookback with nothing in it is a normal outcome, not a failure.
				if (response.status === 404 && isEmptyResult(body)) {
					cache.set(url, null, cacheTtlMs, 0);
					return null;
				}
				throw new ProviderError(`CoastWatch request failed (${response.status}): ${url}`, {
					retryable: response.status >= 500
				});
			}

			const observation = parseCoastwatchKd490(body, url);
			cache.set(url, observation, cacheTtlMs, 0);
			return observation;
		}
	};
}

/** Turn an observation (or its absence) into the `/clarity` payload. */
export function toClarityObservation(
	spotId: string,
	observation: Kd490Observation | null
): ClarityObservation {
	const derived = deriveClarity(observation?.kd490 ?? null);
	return {
		spotId,
		observedAt: observation?.observedAt ?? null,
		kd490: derived.kd490,
		secchiDepthM: derived.secchiDepthM,
		rating: derived.rating,
		pixel: observation?.pixel ?? null
	};
}

export interface CoastwatchAdapterOptions {
	source?: CoastwatchSource;
}

/**
 * Build the CoastWatch clarity adapter that plugs into `getSpotData`.
 *
 * Samples the spot's in-water `offshoreModelPoint`; an all-cloud lookback (or no
 * sample point) yields a null observation, not a failure.
 */
export function createCoastwatchAdapter(
	options: CoastwatchAdapterOptions = {}
): ProviderAdapter<ClarityObservation> {
	const source = options.source ?? createCoastwatchSource();

	return {
		id: COASTWATCH_PROVIDER_ID,
		ttlMs: COASTWATCH_TTL_MS,
		staleTtlMs: COASTWATCH_STALE_TTL_MS,
		async fetch({ spot, window }): Promise<ProviderPayload<ClarityObservation>> {
			const point = spot.offshoreModelPoint;
			const observation = await source.getLatestKd490(point, window.start);
			return {
				data: toClarityObservation(spot.id, observation),
				// The satellite day is the payload vintage; with no clear pixel,
				// floor at the window end (the latest instant searched) so the
				// envelope never reads as older than the search itself.
				asOf: observation?.observedAt ?? window.end
			};
		}
	};
}
