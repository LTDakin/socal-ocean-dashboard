/**
 * `lib/providers/gfswave.ts` — the GFS-Wave (WAVEWATCH III) forecast adapter.
 *
 * The forecast is the product, so this adapter does the heavy lifting: it picks
 * the latest model cycle, fetches one small SoCal **region subset per forecast
 * hour** (cheap, and shared across spots by the source cache), samples each
 * spot's offshore model point, and emits the `hourly[]`/`daily[]` contract.
 *
 * Decoding lives in `lib/grib2`; this file never touches GRIB2 bytes directly.
 * Derived daily extremes come from `lib/derive`. All values are SI.
 */
import { TtlCache } from '../cache';
import { aggregateDaily, type DailyWavePoint, type DailyWaveSummary } from '../derive';
import {
	fetchSubsetFields,
	sampleField,
	selectField,
	type FetchDeps,
	type FetchLike,
	type GribField,
	type Subregion
} from '../grib2';
import type { Spot } from '../spots';
import {
	ProviderError,
	type ForecastWindow,
	type ProviderAdapter,
	type ProviderPayload
} from './types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** GFS-Wave cycles are 00/06/12/18Z. */
const MODEL_RUN_INTERVAL_HOURS = 6;
/** Products trail the cycle by a few hours before NOMADS serves them. */
const DEFAULT_LATENCY_HOURS = 4;

export const GFSWAVE_PROVIDER_ID = 'gfswave';
/** Fresh for the model's ~1 h cadence, servable stale for 6 h on upstream error. */
export const GFSWAVE_TTL_MS = HOUR_MS;
export const GFSWAVE_STALE_TTL_MS = 6 * HOUR_MS;

/**
 * West-Coast region box (signed degrees) covering every seed spot's offshore
 * model point. One subset serves all spots; the source converts to NOMADS'
 * native `[0, 360)` longitudes.
 */
export const SO_CAL_REGION: Subregion = { top: 34.9, bottom: 32.0, left: -120.4, right: -116.8 };

/** Variables the forecast needs — all present on the `wcoast.0p16` domain. */
export const GFSWAVE_VARIABLES = [
	'HTSGW',
	'PERPW',
	'DIRPW',
	'WVHGT',
	'WVPER',
	'WVDIR',
	'SWELL',
	'SWPER',
	'SWDIR',
	'WIND',
	'WDIR',
	'UGRD',
	'VGRD'
];

/** One swell partition from the spectral split (heights/periods/directions SI). */
export interface SwellPartition {
	heightM: number | null;
	periodS: number | null;
	directionDeg: number | null;
}

/** One hourly forecast sample at a spot's offshore model point. */
export interface WaveHourlyPoint {
	time: string;
	waveHeightM: number | null;
	dominantPeriodS: number | null;
	dominantDirectionDeg: number | null;
	windWaveHeightM: number | null;
	windWavePeriodS: number | null;
	windWaveDirectionDeg: number | null;
	swellHeightM: number | null;
	swellPeriodS: number | null;
	swellDirectionDeg: number | null;
	swellPartitions: SwellPartition[];
	windSpeedMs: number | null;
	windDirectionDeg: number | null;
}

/** The GFS-Wave payload: the forecast contract's `hourly[]` + `daily[]`. */
export interface GfsWaveForecast {
	spotId: string;
	/** Model run driving every value (ISO-8601 UTC). */
	modelRun: string;
	/** When this payload was assembled (ISO-8601 UTC). */
	generatedAt: string;
	window: ForecastWindow;
	hourly: WaveHourlyPoint[];
	daily: DailyWaveSummary[];
}

/** Fetches the decoded fields for one forecast hour of a model cycle. */
export interface GfsWaveSource {
	getHourlyFields(cycle: Date, hour: number): Promise<GribField[]>;
}

export interface NomadsSourceOptions {
	region?: Subregion;
	variables?: string[];
	domain?: string;
	fetchImpl?: FetchLike;
	signal?: AbortSignal;
	cache?: TtlCache;
	cacheTtlMs?: number;
}

/** Newest 00/06/12/18Z run at least `latencyHours` old. */
export function latestModelCycle(now: Date, options: { latencyHours?: number } = {}): Date {
	const latencyHours = options.latencyHours ?? DEFAULT_LATENCY_HOURS;
	const cycle = new Date(now.getTime() - latencyHours * HOUR_MS);
	cycle.setUTCMinutes(0, 0, 0);
	cycle.setUTCHours(
		Math.floor(cycle.getUTCHours() / MODEL_RUN_INTERVAL_HOURS) * MODEL_RUN_INTERVAL_HOURS
	);
	return cycle;
}

/** Model cadence: hourly to +120 h, then 3-hourly to +384 h (16 days). */
const MODEL_HOURS: readonly number[] = (() => {
	const hours: number[] = [];
	for (let hour = 0; hour <= 120; hour += 1) hours.push(hour);
	for (let hour = 123; hour <= 384; hour += 3) hours.push(hour);
	return hours;
})();

/** Model hours whose valid time ([cycle + h]) falls inside the window. */
export function selectForecastHours(cycle: Date, window: ForecastWindow): number[] {
	const start = Date.parse(window.start);
	const end = Date.parse(window.end);
	const base = cycle.getTime();
	return MODEL_HOURS.filter((hour) => {
		const validTime = base + hour * HOUR_MS;
		return validTime >= start && validTime <= end;
	});
}

/** Default window: this hour through `days` days later. */
export function defaultForecastWindow(
	now: Date = new Date(),
	options: { days?: number } = {}
): ForecastWindow {
	const days = options.days ?? 14;
	const start = new Date(now);
	start.setUTCMinutes(0, 0, 0);
	return {
		start: start.toISOString(),
		end: new Date(start.getTime() + days * DAY_MS).toISOString()
	};
}

/** Build the real NOMADS-backed source, caching decoded fields per (cycle, hour). */
export function createNomadsSource(options: NomadsSourceOptions = {}): GfsWaveSource {
	const region = options.region ?? SO_CAL_REGION;
	const variables = options.variables ?? GFSWAVE_VARIABLES;
	const cache = options.cache ?? new TtlCache();
	const cacheTtlMs = options.cacheTtlMs ?? GFSWAVE_TTL_MS;
	const deps: FetchDeps = {};
	if (options.fetchImpl) deps.fetchImpl = options.fetchImpl;
	if (options.signal) deps.signal = options.signal;

	return {
		async getHourlyFields(cycle: Date, hour: number): Promise<GribField[]> {
			const bounds = `${region.left},${region.right},${region.bottom},${region.top}`;
			const key = `${GFSWAVE_PROVIDER_ID}:region:${cycle.toISOString()}:${hour}:${bounds}`;
			const cached = cache.get<GribField[]>(key);
			if (cached) return cached;
			const fields = await fetchSubsetFields(
				{ cycle, forecastHour: hour, variables, domain: options.domain, subregion: region },
				deps
			);
			cache.set(key, fields, cacheTtlMs, 0);
			return fields;
		}
	};
}

/** Run `worker` over `items` with at most `limit` in flight at once. */
async function mapLimit<T, R>(
	items: readonly T[],
	limit: number,
	worker: (item: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;
	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await worker(items[index]);
		}
	});
	await Promise.all(runners);
	return results;
}

function sampleValue(
	fields: readonly GribField[],
	selector: { var: string; occurrence?: number },
	lat: number,
	lon: number
): number | null {
	const field = selectField(fields, selector);
	if (!field) return null;
	return sampleField(field, lat, lon)?.value ?? null;
}

/** Meteorological wind direction (from) computed from U/V components. */
function windDirectionFromComponents(u: number | null, v: number | null): number | null {
	if (u === null || v === null) return null;
	const from = 270 - (Math.atan2(v, u) * 180) / Math.PI;
	return ((from % 360) + 360) % 360;
}

function dominantPartition(partitions: readonly SwellPartition[]): SwellPartition | undefined {
	let best: SwellPartition | undefined;
	for (const partition of partitions) {
		if (partition.heightM === null) continue;
		if (best === undefined || best.heightM === null || partition.heightM > best.heightM) {
			best = partition;
		}
	}
	return best ?? partitions[0];
}

/** Sample one hourly wave point from a field set at a coordinate. */
export function sampleWavePoint(
	fields: readonly GribField[],
	lat: number,
	lon: number
): WaveHourlyPoint | undefined {
	const significant = selectField(fields, { var: 'HTSGW' });
	if (!significant) return undefined;

	const swellPartitions: SwellPartition[] = [];
	for (let occurrence = 0; occurrence < 3; occurrence += 1) {
		const partition: SwellPartition = {
			heightM: sampleValue(fields, { var: 'SWELL', occurrence }, lat, lon),
			periodS: sampleValue(fields, { var: 'SWPER', occurrence }, lat, lon),
			directionDeg: sampleValue(fields, { var: 'SWDIR', occurrence }, lat, lon)
		};
		if (
			partition.heightM !== null ||
			partition.periodS !== null ||
			partition.directionDeg !== null
		) {
			swellPartitions.push(partition);
		}
	}
	const dominantSwell = dominantPartition(swellPartitions);

	const windSpeedMs = sampleValue(fields, { var: 'WIND' }, lat, lon);
	const windDirectionDeg =
		sampleValue(fields, { var: 'WDIR' }, lat, lon) ??
		windDirectionFromComponents(
			sampleValue(fields, { var: 'UGRD' }, lat, lon),
			sampleValue(fields, { var: 'VGRD' }, lat, lon)
		);

	return {
		time: significant.validTime,
		waveHeightM: sampleField(significant, lat, lon)?.value ?? null,
		dominantPeriodS: sampleValue(fields, { var: 'PERPW' }, lat, lon),
		dominantDirectionDeg: sampleValue(fields, { var: 'DIRPW' }, lat, lon),
		windWaveHeightM: sampleValue(fields, { var: 'WVHGT' }, lat, lon),
		windWavePeriodS: sampleValue(fields, { var: 'WVPER' }, lat, lon),
		windWaveDirectionDeg: sampleValue(fields, { var: 'WVDIR' }, lat, lon),
		swellHeightM: dominantSwell?.heightM ?? null,
		swellPeriodS: dominantSwell?.periodS ?? null,
		swellDirectionDeg: dominantSwell?.directionDeg ?? null,
		swellPartitions,
		windSpeedMs,
		windDirectionDeg
	};
}

function toDailyPoint(point: WaveHourlyPoint): DailyWavePoint {
	return {
		time: point.time,
		waveHeightM: point.waveHeightM,
		dominantPeriodS: point.dominantPeriodS,
		dominantDirectionDeg: point.dominantDirectionDeg,
		swellHeightM: point.swellHeightM,
		swellPeriodS: point.swellPeriodS,
		swellDirectionDeg: point.swellDirectionDeg
	};
}

export interface BuildForecastInput {
	spot: Spot;
	cycle: Date;
	window: ForecastWindow;
	hours: readonly number[];
	fieldsByHour: ReadonlyMap<number, readonly GribField[]>;
	generatedAt: string;
}

/** Pure: sample each hour at the spot, aggregate daily, shape the contract. */
export function buildGfsWaveForecast(input: BuildForecastInput): GfsWaveForecast {
	const { spot, cycle, window, hours, fieldsByHour } = input;
	const { lat, lon } = spot.offshoreModelPoint;

	const hourly: WaveHourlyPoint[] = [];
	for (const hour of hours) {
		const fields = fieldsByHour.get(hour);
		if (!fields) continue;
		const point = sampleWavePoint(fields, lat, lon);
		if (point) hourly.push(point);
	}
	hourly.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

	return {
		spotId: spot.id,
		modelRun: cycle.toISOString(),
		generatedAt: input.generatedAt,
		window,
		hourly,
		daily: aggregateDaily(hourly.map(toDailyPoint))
	};
}

export interface GfsWaveAdapterOptions {
	source?: GfsWaveSource;
	now?: () => number;
	latencyHours?: number;
	/** Max concurrent upstream hour fetches. */
	concurrency?: number;
}

/** Build the GFS-Wave adapter that plugs into `getSpotData`. */
export function createGfsWaveAdapter(
	options: GfsWaveAdapterOptions = {}
): ProviderAdapter<GfsWaveForecast> {
	const source = options.source ?? createNomadsSource();
	const now = options.now ?? Date.now;
	const concurrency = options.concurrency ?? 6;

	return {
		id: GFSWAVE_PROVIDER_ID,
		ttlMs: GFSWAVE_TTL_MS,
		staleTtlMs: GFSWAVE_STALE_TTL_MS,
		async fetch({ spot, window }): Promise<ProviderPayload<GfsWaveForecast>> {
			const cycle = latestModelCycle(new Date(now()), { latencyHours: options.latencyHours });
			const hours = selectForecastHours(cycle, window);
			if (hours.length === 0) {
				throw new ProviderError(`GFS-Wave has no hours in the requested window for ${spot.id}`, {
					code: 'not_found',
					retryable: false
				});
			}

			let fieldsByHour: Map<number, GribField[]>;
			try {
				const fetched = await mapLimit(hours, concurrency, async (hour) => ({
					hour,
					fields: await source.getHourlyFields(cycle, hour)
				}));
				fieldsByHour = new Map(fetched.map((entry) => [entry.hour, entry.fields]));
			} catch (cause) {
				if (cause instanceof ProviderError) throw cause;
				throw new ProviderError(`GFS-Wave fetch failed for ${spot.id}`, { cause });
			}

			return {
				data: buildGfsWaveForecast({
					spot,
					cycle,
					window,
					hours,
					fieldsByHour,
					generatedAt: new Date(now()).toISOString()
				}),
				asOf: cycle.toISOString(),
				modelRun: cycle.toISOString()
			};
		}
	};
}
