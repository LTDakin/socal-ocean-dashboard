/**
 * `lib/providers/coops-obs.ts` — the NOAA CO-OPS *observation* adapter.
 *
 * `coops.ts` covers tide *predictions*; this adapter covers what the stations are
 * actually measuring right now (see `docs/data-sources.md` → NOAA CO-OPS):
 *
 * - `water_level` — the MLLW reading every 6 min, over the observation window so
 *   the tide *state* (rising/falling/steady) can be derived from its rate.
 * - `water_temperature` / `wind` — `date=latest`, so a sensor that reported hours
 *   ago still yields its most recent value (labelled with its real observation
 *   time on the contract).
 *
 * It is a separate provider id (`coops-obs`) from the prediction adapter so
 * `/tides` and `/current` cache independently. `fetch` is injectable
 * (`AGENTS.md` rule 8). Units are metric (SI).
 */
import { TtlCache } from '../cache';
import { COOPS_DATAGETTER_URL, parseCoopsTime } from './coops';
import {
	ProviderError,
	type ForecastWindow,
	type ProviderAdapter,
	type ProviderPayload
} from './types';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export const COOPS_OBS_PROVIDER_ID = 'coops-obs';
/** Station sensors report every 6 min; keep the cache short to stay "now". */
export const COOPS_OBS_TTL_MS = 15 * MINUTE_MS;
/** Sensor/API outage: serve the last good reading for up to 6 h. */
export const COOPS_OBS_STALE_TTL_MS = 6 * HOUR_MS;

/** A water-level rate below this reads as slack water (m/h). */
export const TIDE_STEADY_THRESHOLD_MPER_HOUR = 0.05;

/** The observation products we read. */
export type CoopsObservationProduct = 'water_level' | 'water_temperature' | 'wind';

/** Minimal fetch shape so callers can inject a stub. */
export type CoopsObsFetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** One observation row as returned by the Data API. */
export interface RawCoopsObservation {
	/** `YYYY-MM-DD HH:MM` in GMT. */
	t: string;
	/** Value — water level (m) or water temperature (°C). */
	v?: string;
	/** Speed — wind (m/s). */
	s?: string;
	/** Direction — wind (degrees true). */
	d?: string;
}

/** Tide state derived from the water-level rate over the window. */
export interface TideTrend {
	waterLevelM: number;
	observedAt: string;
	/** Signed rate over the window, meters per hour. */
	rateMPerHour: number;
	tideState: 'rising' | 'falling' | 'steady';
}

/** The CO-OPS observation payload for one spot. */
export interface CoopsObservations {
	spotId: string;
	stationId: string | null;
	window: ForecastWindow;
	waterLevel: TideTrend | null;
	waterTempC: number | null;
	waterTempObservedAt: string | null;
	windSpeedMs: number | null;
	windDirDeg: number | null;
	windObservedAt: string | null;
}

/** `2026-10-11T16:00:00Z` → the Data API's `20261011 16:00` (GMT). */
function toDateTimeParam(iso: string): string {
	return `${iso.slice(0, 10).replaceAll('-', '')} ${iso.slice(11, 16)}`;
}

/**
 * Build the Data API URL for one observation product.
 *
 * Water level is pulled as a range (it needs a series for the trend); the other
 * products use `date=latest` so a lagging sensor still reports its last value.
 */
export function buildCoopsObservationUrl(params: {
	stationId: string;
	product: CoopsObservationProduct;
	window: ForecastWindow;
}): string {
	const url = new URL(COOPS_DATAGETTER_URL);
	url.searchParams.set('product', params.product);
	url.searchParams.set('station', params.stationId);
	if (params.product === 'water_level') {
		url.searchParams.set('begin_date', toDateTimeParam(params.window.start));
		url.searchParams.set('end_date', toDateTimeParam(params.window.end));
		url.searchParams.set('datum', 'MLLW');
	} else {
		url.searchParams.set('date', 'latest');
	}
	url.searchParams.set('units', 'metric');
	url.searchParams.set('time_zone', 'gmt');
	url.searchParams.set('format', 'json');
	// CO-OPS wants `begin_date=YYYYMMDD HH:MM`; URLSearchParams would send `+`
	// for the space, which the API does not decode.
	return url.toString().replaceAll('+', '%20');
}

interface CoopsObservationResponse {
	data?: RawCoopsObservation[];
	error?: { message?: string };
}

function toFinite(value: string | undefined): number | null {
	if (value === undefined || value.trim() === '') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRow(row: RawCoopsObservation): { time: string; value: number } | null {
	const time = parseCoopsTime(row.t);
	const value = toFinite(row.v);
	if (!time || value === null) return null;
	return { time, value };
}

/**
 * Latest MLLW reading plus the observed tide state.
 *
 * Rate is `(last - first) / hours` across the window's rows; a single reading
 * (or a flat sensor) reports `steady` with a zero rate.
 */
export function computeTideTrend(rows: readonly RawCoopsObservation[]): TideTrend | null {
	const points = rows
		.map(normalizeRow)
		.filter((point): point is { time: string; value: number } => point !== null)
		.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
	if (points.length === 0) return null;

	const last = points[points.length - 1];
	const first = points[0];
	const hours = (Date.parse(last.time) - Date.parse(first.time)) / HOUR_MS;
	const rateMPerHour = hours > 0 ? (last.value - first.value) / hours : 0;

	let tideState: TideTrend['tideState'] = 'steady';
	if (Math.abs(rateMPerHour) >= TIDE_STEADY_THRESHOLD_MPER_HOUR) {
		tideState = rateMPerHour > 0 ? 'rising' : 'falling';
	}

	return { waterLevelM: last.value, observedAt: last.time, rateMPerHour, tideState };
}

/** The latest wind row, speed and direction together (never mixed stations). */
function latestWind(
	rows: readonly RawCoopsObservation[]
): { observedAt: string; windSpeedMs: number; windDirDeg: number | null } | null {
	let latest: { observedAt: string; windSpeedMs: number; windDirDeg: number | null } | null = null;
	for (const row of rows) {
		const time = parseCoopsTime(row.t);
		const speed = toFinite(row.s);
		if (!time || speed === null) continue;
		if (!latest || time > latest.observedAt) {
			latest = { observedAt: time, windSpeedMs: speed, windDirDeg: toFinite(row.d) };
		}
	}
	return latest;
}

function latestValue(
	rows: readonly RawCoopsObservation[]
): { observedAt: string; value: number } | null {
	let latest: { observedAt: string; value: number } | null = null;
	for (const row of rows) {
		const normalized = normalizeRow(row);
		if (!normalized) continue;
		if (!latest || normalized.time > latest.observedAt) {
			latest = { observedAt: normalized.time, value: normalized.value };
		}
	}
	return latest;
}

/** Assemble the contract payload from the three raw products. */
export function buildCoopsObservations(params: {
	spotId: string;
	stationId: string;
	window: ForecastWindow;
	waterLevel: readonly RawCoopsObservation[];
	waterTemperature: readonly RawCoopsObservation[];
	wind: readonly RawCoopsObservation[];
}): CoopsObservations {
	const waterTemp = latestValue(params.waterTemperature);
	const wind = latestWind(params.wind);
	return {
		spotId: params.spotId,
		stationId: params.stationId,
		window: params.window,
		waterLevel: computeTideTrend(params.waterLevel),
		waterTempC: waterTemp?.value ?? null,
		waterTempObservedAt: waterTemp?.observedAt ?? null,
		windSpeedMs: wind?.windSpeedMs ?? null,
		windDirDeg: wind?.windDirDeg ?? null,
		windObservedAt: wind?.observedAt ?? null
	};
}

/** Fetches raw observation rows for one station/product. */
export interface CoopsObsSource {
	getObservations(
		stationId: string,
		product: CoopsObservationProduct,
		window: ForecastWindow
	): Promise<RawCoopsObservation[]>;
}

export interface CoopsObsSourceOptions {
	fetchImpl?: CoopsObsFetchLike;
	signal?: AbortSignal;
	cache?: TtlCache;
	cacheTtlMs?: number;
}

/** Build the real Data API source, caching raw rows by full request URL. */
export function createCoopsObsSource(options: CoopsObsSourceOptions = {}): CoopsObsSource {
	const cache = options.cache ?? new TtlCache();
	const cacheTtlMs = options.cacheTtlMs ?? COOPS_OBS_TTL_MS;

	return {
		async getObservations(
			stationId: string,
			product: CoopsObservationProduct,
			window: ForecastWindow
		): Promise<RawCoopsObservation[]> {
			const url = buildCoopsObservationUrl({ stationId, product, window });
			const cached = cache.get<RawCoopsObservation[]>(url);
			if (cached) return cached;

			const impl = options.fetchImpl ?? fetch;
			let response: Response;
			try {
				response = await impl(url, options.signal ? { signal: options.signal } : {});
			} catch (cause) {
				throw new ProviderError(`CO-OPS request failed: ${url}`, { cause });
			}
			if (!response.ok) {
				throw new ProviderError(`CO-OPS request failed (${response.status}): ${url}`, {
					retryable: response.status >= 500
				});
			}

			let parsed: CoopsObservationResponse;
			try {
				parsed = JSON.parse(await response.text()) as CoopsObservationResponse;
			} catch (cause) {
				throw new ProviderError(`CO-OPS returned non-JSON for ${url}`, { cause });
			}
			// An `error` body from a station without the sensor (or a gap) is an
			// absent observation, not a failure: other fields still populate
			// `/current`. HTTP-level failures above still throw.
			const rows = parsed.data ?? [];
			cache.set(url, rows, cacheTtlMs, 0);
			return rows;
		}
	};
}

export interface CoopsObsAdapterOptions {
	source?: CoopsObsSource;
}

/** Build the CO-OPS observation adapter that plugs into `getSpotData`. */
export function createCoopsObsAdapter(
	options: CoopsObsAdapterOptions = {}
): ProviderAdapter<CoopsObservations> {
	const source = options.source ?? createCoopsObsSource();

	return {
		id: COOPS_OBS_PROVIDER_ID,
		ttlMs: COOPS_OBS_TTL_MS,
		staleTtlMs: COOPS_OBS_STALE_TTL_MS,
		async fetch({ spot, window }): Promise<ProviderPayload<CoopsObservations>> {
			const stationId = spot.coopsStationId ?? null;
			if (!stationId) {
				return {
					data: emptyObservations(spot.id, window),
					asOf: window.start
				};
			}

			const [waterLevel, waterTemperature, wind] = await Promise.all([
				source.getObservations(stationId, 'water_level', window),
				source.getObservations(stationId, 'water_temperature', window),
				source.getObservations(stationId, 'wind', window)
			]);

			const data = buildCoopsObservations({
				spotId: spot.id,
				stationId,
				window,
				waterLevel,
				waterTemperature,
				wind
			});
			return {
				data,
				asOf: newestObservationTime(data) ?? window.start
			};
		}
	};
}

function emptyObservations(spotId: string, window: ForecastWindow): CoopsObservations {
	return {
		spotId,
		stationId: null,
		window,
		waterLevel: null,
		waterTempC: null,
		waterTempObservedAt: null,
		windSpeedMs: null,
		windDirDeg: null,
		windObservedAt: null
	};
}

function newestObservationTime(data: CoopsObservations): string | null {
	const times = [data.waterLevel?.observedAt, data.waterTempObservedAt, data.windObservedAt].filter(
		(time): time is string => typeof time === 'string'
	);
	let newest: string | null = null;
	for (const time of times) {
		if (!newest || time > newest) newest = time;
	}
	return newest;
}
