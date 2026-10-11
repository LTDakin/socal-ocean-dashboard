/**
 * `lib/providers/cdip.ts` — the CDIP (Scripps) real-time buoy-observation adapter.
 *
 * CDIP publishes aggregated buoy observations through its IOOS ERDDAP
 * (`tabledap/wave_agg`): significant wave height, peak period, and peak
 * direction, per station, every ~30 minutes. This is the best-in-class
 * near-shore source for the `/current` snapshot (see `docs/data-sources.md`).
 *
 * `fetch` is injectable (`AGENTS.md` rule 8): tests and CI replay committed
 * fixtures under `fixtures/cdip/`, never the live API. Units are metric (SI).
 */
import { TtlCache } from '../cache';
import { ProviderError, type ProviderAdapter, type ProviderPayload } from './types';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** CDIP IOOS ERDDAP root (tabledap served from here). */
export const CDIP_ERDDAP_URL = 'https://erddap.cdip.ucsd.edu/erddap';
/** The all-stations aggregated wave-observation dataset. */
export const CDIP_WAVE_DATASET = 'wave_agg';
/** Columns read: observation time, significant height, peak period/direction. */
export const CDIP_WAVE_VARIABLES = ['time', 'waveHs', 'waveTp', 'waveDp'] as const;

export const CDIP_PROVIDER_ID = 'cdip';
/** Buoys report every ~30 min; refresh on the same cadence. */
export const CDIP_TTL_MS = 30 * MINUTE_MS;
/** Buoy outage / ERDDAP hiccup: serve the last good reading for up to 6 h. */
export const CDIP_STALE_TTL_MS = 6 * HOUR_MS;

/** Minimal fetch shape so callers can inject a stub. */
export type CdipFetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** A normalized buoy wave observation (SI). */
export interface WaveObservation {
	/** Upstream observation time, ISO-8601 UTC. */
	observedAt: string;
	/** Significant wave height, meters. */
	waveHeightM: number | null;
	/** Peak period, seconds (CDIP `waveTp`). */
	wavePeriodS: number | null;
	/** Peak wave direction, degrees true (CDIP `waveDp`). */
	waveDirDeg: number | null;
}

/** The CDIP payload: the latest buoy reading for one spot, if any. */
export interface CdipObservations {
	spotId: string;
	/** The linked CDIP buoy, or `null` when the spot has none. */
	stationId: string | null;
	observation: WaveObservation | null;
}

/**
 * Build the ERDDAP tabledap URL for one station's observations since `since`.
 *
 * ERDDAP wants an unquoted comma-separated variable list followed by filters;
 * the station id is quoted (`station_id="201"`).
 */
export function buildCdipWaveUrl(params: { stationId: string; since: string }): string {
	const variables = CDIP_WAVE_VARIABLES.join(',');
	const station = `station_id=${encodeURIComponent(`"${params.stationId}"`)}`;
	const since = `time>=${encodeURIComponent(params.since)}`;
	return `${CDIP_ERDDAP_URL}/tabledap/${CDIP_WAVE_DATASET}.json?${variables}&${station}&${since}`;
}

interface ErddapJson {
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
 * row that carries at least one wave value, or `null` when there are none.
 */
export function parseCdipWave(body: string, context: string): WaveObservation | null {
	let parsed: ErddapJson;
	try {
		parsed = JSON.parse(body) as ErddapJson;
	} catch (cause) {
		throw new ProviderError(`CDIP returned non-JSON for ${context}`, { cause });
	}

	const columns = parsed.table?.columnNames;
	const rows = parsed.table?.rows;
	if (!columns || !rows) return null;

	const index = new Map(columns.map((name, position) => [name, position]));
	const cell = (row: unknown[], column: string): unknown => {
		const position = index.get(column);
		return position === undefined ? undefined : row[position];
	};

	let latest: WaveObservation | null = null;
	for (const row of rows) {
		const observedAt = toIso(cell(row, 'time'));
		if (!observedAt) continue;
		const observation: WaveObservation = {
			observedAt,
			waveHeightM: toNumber(cell(row, 'waveHs')),
			wavePeriodS: toNumber(cell(row, 'waveTp')),
			waveDirDeg: toNumber(cell(row, 'waveDp'))
		};
		if (
			observation.waveHeightM === null &&
			observation.wavePeriodS === null &&
			observation.waveDirDeg === null
		) {
			continue;
		}
		if (!latest || observation.observedAt > latest.observedAt) latest = observation;
	}
	return latest;
}

/** ERDDAP signals an empty result set as a 404 with this message. */
function isEmptyResult(body: string): boolean {
	return /no matching results/i.test(body);
}

/** Fetches the latest buoy observation for one station. */
export interface CdipSource {
	getLatestWave(stationId: string, since: string): Promise<WaveObservation | null>;
}

export interface CdipSourceOptions {
	fetchImpl?: CdipFetchLike;
	signal?: AbortSignal;
	cache?: TtlCache;
	cacheTtlMs?: number;
}

/** Build the real ERDDAP source, caching results by full request URL. */
export function createCdipSource(options: CdipSourceOptions = {}): CdipSource {
	const cache = options.cache ?? new TtlCache();
	const cacheTtlMs = options.cacheTtlMs ?? CDIP_TTL_MS;

	return {
		async getLatestWave(stationId: string, since: string): Promise<WaveObservation | null> {
			const url = buildCdipWaveUrl({ stationId, since });
			const cached = cache.get<WaveObservation | null>(url);
			if (cached !== undefined) return cached;

			const impl = options.fetchImpl ?? fetch;
			let response: Response;
			try {
				response = await impl(url, options.signal ? { signal: options.signal } : {});
			} catch (cause) {
				throw new ProviderError(`CDIP request failed: ${url}`, { cause });
			}

			const body = await response.text();
			if (!response.ok) {
				// An empty window is a normal outcome, not a failure.
				if (response.status === 404 && isEmptyResult(body)) {
					cache.set(url, null, cacheTtlMs, 0);
					return null;
				}
				throw new ProviderError(`CDIP request failed (${response.status}): ${url}`, {
					retryable: response.status >= 500
				});
			}

			const observation = parseCdipWave(body, url);
			cache.set(url, observation, cacheTtlMs, 0);
			return observation;
		}
	};
}

export interface CdipAdapterOptions {
	source?: CdipSource;
}

/** Build the CDIP adapter that plugs into `getSpotData`. */
export function createCdipAdapter(
	options: CdipAdapterOptions = {}
): ProviderAdapter<CdipObservations> {
	const source = options.source ?? createCdipSource();

	return {
		id: CDIP_PROVIDER_ID,
		ttlMs: CDIP_TTL_MS,
		staleTtlMs: CDIP_STALE_TTL_MS,
		async fetch({ spot, window }): Promise<ProviderPayload<CdipObservations>> {
			const stationId = spot.cdipBuoyId ?? null;
			if (!stationId) {
				// No buoy linked: an honest empty payload, not a failure. Other
				// sources still populate `/current`.
				return {
					data: { spotId: spot.id, stationId: null, observation: null },
					asOf: window.start
				};
			}

			const observation = await source.getLatestWave(stationId, window.start);
			return {
				data: { spotId: spot.id, stationId, observation },
				// An empty window floors asOf at the window start so it never
				// masks a fresher source in the envelope.
				asOf: observation?.observedAt ?? window.start
			};
		}
	};
}
