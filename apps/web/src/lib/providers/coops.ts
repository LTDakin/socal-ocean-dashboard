/**
 * `lib/providers/coops.ts` — the NOAA CO-OPS tide-prediction adapter.
 *
 * CO-OPS publishes deterministic harmonic tide predictions (MLLW) per station.
 * The `/tides` contract wants one series with high/low flags, but the Data API
 * splits that across two `interval`s — `h` (hourly curve) and `hilo` (the sole
 * high/low events) — so this adapter makes both cheap calls over the window and
 * merges them.
 *
 * `fetch` is injectable (`AGENTS.md` rule 8): tests and CI replay committed
 * fixtures under `fixtures/coops/`, never the live API. All heights are metric
 * (SI); display conversion is the frontend's job.
 */
import { TtlCache } from '../cache';
import {
	ProviderError,
	type ForecastWindow,
	type ProviderAdapter,
	type ProviderPayload
} from './types';

const HOUR_MS = 60 * 60 * 1000;

export const COOPS_PROVIDER_ID = 'coops';
/** Predictions are static; refresh every 6 h per `docs/data-sources.md`. */
export const COOPS_TTL_MS = 6 * HOUR_MS;
/** Servable stale for two days on upstream error (predictions barely change). */
export const COOPS_STALE_TTL_MS = 48 * HOUR_MS;

/** The CO-OPS Data API `datagetter` endpoint (no token required). */
export const COOPS_DATAGETTER_URL = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

/** Prediction sampling: `h` hourly curve, `hilo` high/low events only. */
export type CoopsInterval = 'h' | 'hilo';

/** Minimal fetch shape so callers can inject a stub. */
export type CoopsFetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** One prediction row as returned by the Data API (`t` is `YYYY-MM-DD HH:MM` GMT). */
export interface RawTidePrediction {
	t: string;
	v: string;
	/** Present only on `hilo` rows: `H` high, `L` low. */
	type?: 'H' | 'L';
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

/** The CO-OPS payload: an MLLW tide series for one station over the window. */
export interface CoopsTides {
	spotId: string;
	stationId: string;
	datum: 'MLLW';
	units: 'metric';
	window: ForecastWindow;
	generatedAt: string;
	predictions: TidePrediction[];
}

/** `YYYY-MM-DD…` → the Data API's `YYYYMMDD` date parameter. */
function toDateParam(iso: string): string {
	return iso.slice(0, 10).replaceAll('-', '');
}

/** Build the Data API URL for one station's predictions over a window. */
export function buildCoopsPredictionsUrl(params: {
	stationId: string;
	window: ForecastWindow;
	interval?: CoopsInterval;
}): string {
	const url = new URL(COOPS_DATAGETTER_URL);
	url.searchParams.set('product', 'predictions');
	url.searchParams.set('station', params.stationId);
	url.searchParams.set('begin_date', toDateParam(params.window.start));
	url.searchParams.set('end_date', toDateParam(params.window.end));
	url.searchParams.set('datum', 'MLLW');
	url.searchParams.set('units', 'metric');
	url.searchParams.set('time_zone', 'gmt');
	url.searchParams.set('format', 'json');
	url.searchParams.set('interval', params.interval ?? 'h');
	return url.toString();
}

/** `2026-10-11 04:55` (GMT) → `2026-10-11T04:55:00.000Z`, or `null` if unparseable. */
export function parseCoopsTime(t: string): string | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t.trim());
	if (!match) return null;
	const [, year, month, day, hour, minute, second] = match;
	const ms = Date.UTC(
		Number(year),
		Number(month) - 1,
		Number(day),
		Number(hour),
		Number(minute),
		second ? Number(second) : 0
	);
	return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Normalize + merge the hourly curve with the high/low events into one sorted
 * series, keyed by instant (an extreme that lands exactly on an hour replaces
 * that point, carrying the flag), clipped to `[window.start, window.end]`.
 */
export function buildTidePredictions(
	hourly: readonly RawTidePrediction[],
	extremes: readonly RawTidePrediction[],
	window: ForecastWindow
): TidePrediction[] {
	const start = Date.parse(window.start);
	const end = Date.parse(window.end);
	const byTime = new Map<string, TidePrediction>();

	for (const row of hourly) {
		const time = parseCoopsTime(row.t);
		const heightM = Number(row.v);
		if (!time || !Number.isFinite(heightM)) continue;
		byTime.set(time, { time, heightM, highLow: null });
	}
	for (const row of extremes) {
		if (row.type !== 'H' && row.type !== 'L') continue;
		const time = parseCoopsTime(row.t);
		const heightM = Number(row.v);
		if (!time || !Number.isFinite(heightM)) continue;
		byTime.set(time, { time, heightM, highLow: row.type === 'H' ? 'high' : 'low' });
	}

	return [...byTime.values()]
		.filter((point) => {
			const ms = Date.parse(point.time);
			return ms >= start && ms <= end;
		})
		.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

interface CoopsResponse {
	predictions?: RawTidePrediction[];
	error?: { message?: string };
}

function parsePredictions(body: string, url: string): RawTidePrediction[] {
	let parsed: CoopsResponse;
	try {
		parsed = JSON.parse(body) as CoopsResponse;
	} catch (cause) {
		throw new ProviderError(`CO-OPS returned non-JSON for ${url}`, { cause });
	}
	if (parsed.error) {
		// The API carries errors as a 200 + `error` body.
		throw new ProviderError(`CO-OPS error: ${parsed.error.message ?? 'unknown'}`, {
			retryable: true
		});
	}
	return parsed.predictions ?? [];
}

/** Fetches raw prediction rows for one station/window/interval. */
export interface CoopsSource {
	getPredictions(
		stationId: string,
		window: ForecastWindow,
		interval: CoopsInterval
	): Promise<RawTidePrediction[]>;
}

export interface CoopsSourceOptions {
	fetchImpl?: CoopsFetchLike;
	signal?: AbortSignal;
	cache?: TtlCache;
	cacheTtlMs?: number;
}

/** Build the real Data API source, caching raw rows by full request URL. */
export function createCoopsSource(options: CoopsSourceOptions = {}): CoopsSource {
	const cache = options.cache ?? new TtlCache();
	const cacheTtlMs = options.cacheTtlMs ?? COOPS_TTL_MS;

	return {
		async getPredictions(
			stationId: string,
			window: ForecastWindow,
			interval: CoopsInterval
		): Promise<RawTidePrediction[]> {
			const url = buildCoopsPredictionsUrl({ stationId, window, interval });
			const cached = cache.get<RawTidePrediction[]>(url);
			if (cached) return cached;

			const impl = options.fetchImpl ?? fetch;
			let response: Response;
			try {
				response = await impl(url, {
					...(options.signal ? { signal: options.signal } : {})
				});
			} catch (cause) {
				throw new ProviderError(`CO-OPS request failed: ${url}`, { cause });
			}
			if (!response.ok) {
				throw new ProviderError(`CO-OPS request failed (${response.status}): ${url}`, {
					retryable: response.status >= 500
				});
			}

			const rows = parsePredictions(await response.text(), url);
			cache.set(url, rows, cacheTtlMs, 0);
			return rows;
		}
	};
}

export interface CoopsAdapterOptions {
	source?: CoopsSource;
	now?: () => number;
}

/** Build the CO-OPS adapter that plugs into `getSpotData`. */
export function createCoopsAdapter(options: CoopsAdapterOptions = {}): ProviderAdapter<CoopsTides> {
	const source = options.source ?? createCoopsSource();
	const now = options.now ?? Date.now;

	return {
		id: COOPS_PROVIDER_ID,
		ttlMs: COOPS_TTL_MS,
		staleTtlMs: COOPS_STALE_TTL_MS,
		async fetch({ spot, window }): Promise<ProviderPayload<CoopsTides>> {
			const stationId = spot.coopsStationId;
			if (!stationId) {
				throw new ProviderError(`No CO-OPS tide station linked to ${spot.id}`, {
					code: 'not_found',
					retryable: false
				});
			}

			let hourly: RawTidePrediction[];
			let extremes: RawTidePrediction[];
			try {
				[hourly, extremes] = await Promise.all([
					source.getPredictions(stationId, window, 'h'),
					source.getPredictions(stationId, window, 'hilo')
				]);
			} catch (cause) {
				if (cause instanceof ProviderError) throw cause;
				throw new ProviderError(`CO-OPS fetch failed for ${spot.id}`, { cause });
			}

			const predictions = buildTidePredictions(hourly, extremes, window);
			if (predictions.length === 0) {
				throw new ProviderError(`CO-OPS returned no tide predictions for ${spot.id}`, {
					code: 'not_found',
					retryable: false
				});
			}

			const generatedAt = new Date(now()).toISOString();
			return {
				// Predictions are astronomical: there is no upstream production
				// timestamp, so `asOf` is when this payload was assembled.
				data: {
					spotId: spot.id,
					stationId,
					datum: 'MLLW',
					units: 'metric',
					window,
					generatedAt,
					predictions
				},
				asOf: generatedAt
			};
		}
	};
}
