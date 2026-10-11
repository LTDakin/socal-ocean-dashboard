/**
 * `lib/grib2/fetch.ts` — NOMADS GFS-Wave URL builders and fetchers.
 *
 * `fetch` is injectable so tests and adapter specs never touch the network
 * (`AGENTS.md` rule 8). Two paths, matching `docs/data-sources.md`:
 *
 * - **Grib Filter subset** — one request returns only the variables and region we
 *   need (re-packed as simple packing). Preferred for the forecast service.
 * - **`.idx` + HTTP Range** — a single field fetched straight from the full file
 *   (JPEG2000 packed). Cheaper when only one variable is needed.
 */
import { decodeField, decodeFields } from './decode';
import { byteRange, parseFieldIndex, selectIndexEntry, type IndexQuery } from './index-file';
import { Grib2FetchError, type GribField } from './types';

const FILTER_URL = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfswave.pl';
const PUBLIC_BASE = 'https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod';
const DEFAULT_DOMAIN = 'wcoast.0p16';

/** Minimal fetch shape so callers can inject a stub. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchDeps {
	/** Override `globalThis.fetch` (tests, proxies). */
	fetchImpl?: FetchLike;
	signal?: AbortSignal;
}

export interface FetchBytesOptions extends FetchDeps {
	headers?: Record<string, string>;
}

/** A NOMADS model run decomposed into the tokens its URLs need. */
export interface ModelCycle {
	/** `YYYYMMDD`, e.g. `20261011`. */
	day: string;
	/** Two-digit UTC hour, e.g. `00`. */
	hour: string;
	/** File stamp, e.g. `t00z`. */
	stamp: string;
}

function pad2(value: number): string {
	return value.toString().padStart(2, '0');
}

/** Normalize a run instant (or ISO string) into its NOMADS path tokens. */
export function formatCycle(cycle: Date | string): ModelCycle {
	const date = typeof cycle === 'string' ? new Date(cycle) : cycle;
	if (Number.isNaN(date.getTime())) {
		throw new Grib2FetchError(`Invalid model cycle: ${String(cycle)}`);
	}
	const day = `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
	const hour = pad2(date.getUTCHours());
	return { day, hour, stamp: `t${hour}z` };
}

/** Forecast hour token, e.g. `0` → `000`. */
function forecastToken(forecastHour: number): string {
	return forecastHour.toString().padStart(3, '0');
}

/** A lat/lon box for the Grib Filter's server-side subregion. */
export interface Subregion {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

/** Signed degrees → NOMADS' native `[0, 360)` longitude. */
function toNomadsLongitude(longitude: number): number {
	return longitude < 0 ? longitude + 360 : longitude;
}

/** Parameters for a Grib Filter subset request. */
export interface WaveSubsetParams {
	cycle: Date | string;
	/** Forecast hour, e.g. `0` (analysis) … `384`. */
	forecastHour: number;
	/** Variable abbreviations, e.g. `['HTSGW', 'PERPW']`. */
	variables: string[];
	/** Model domain; defaults to `wcoast.0p16` (West Coast). */
	domain?: string;
	/**
	 * Restrict to a lat/lon box server-side (smaller downloads).
	 */
	subregion?: Subregion;
	/**
	 * Restrict to these levels, e.g. `['surface']` or `['1_in_sequence']`. Omit
	 * to return every level for the requested variables — required for the
	 * swell partitions, which live at `N in sequence`, not `surface`.
	 */
	levels?: string[];
}

/** Build the Grib Filter URL for a server-side subset. */
export function buildNomadsWaveUrl(params: WaveSubsetParams): string {
	const { day, hour, stamp } = formatCycle(params.cycle);
	const domain = params.domain ?? DEFAULT_DOMAIN;
	const url = new URL(FILTER_URL);
	url.searchParams.set('dir', `/gfs.${day}/${hour}/wave/gridded`);
	url.searchParams.set(
		'file',
		`gfswave.${stamp}.${domain}.f${forecastToken(params.forecastHour)}.grib2`
	);
	for (const variable of params.variables) {
		url.searchParams.set(`var_${variable.toUpperCase()}`, 'on');
	}
	if (params.levels) {
		for (const level of params.levels) {
			url.searchParams.set(`lev_${level}`, 'on');
		}
	}
	if (params.subregion) {
		url.searchParams.set('subregion', '');
		url.searchParams.set('toplat', String(params.subregion.top));
		url.searchParams.set('bottomlat', String(params.subregion.bottom));
		url.searchParams.set('leftlon', String(toNomadsLongitude(params.subregion.left)));
		url.searchParams.set('rightlon', String(toNomadsLongitude(params.subregion.right)));
	}
	return url.toString();
}

/** Build the direct full-file URL (used with the `.idx` sidecar + Range). */
export function buildNomadsWaveFileUrl(params: {
	cycle: Date | string;
	forecastHour: number;
	domain?: string;
}): string {
	const { day, hour, stamp } = formatCycle(params.cycle);
	const domain = params.domain ?? DEFAULT_DOMAIN;
	return `${PUBLIC_BASE}/gfs.${day}/${hour}/wave/gridded/gfswave.${stamp}.${domain}.f${forecastToken(
		params.forecastHour
	)}.grib2`;
}

async function readBytes(url: string, options: FetchBytesOptions = {}): Promise<Uint8Array> {
	const impl = options.fetchImpl ?? fetch;
	let response: Response;
	try {
		response = await impl(url, {
			...(options.signal ? { signal: options.signal } : {}),
			...(options.headers ? { headers: options.headers } : {})
		});
	} catch (cause) {
		throw new Grib2FetchError(`Request failed: ${url}`, { cause });
	}
	if (!response.ok) {
		throw new Grib2FetchError(`Request failed (${response.status}): ${url}`);
	}
	return new Uint8Array(await response.arrayBuffer());
}

async function readText(url: string, options: FetchDeps = {}): Promise<string> {
	const impl = options.fetchImpl ?? fetch;
	let response: Response;
	try {
		response = await impl(url, { ...(options.signal ? { signal: options.signal } : {}) });
	} catch (cause) {
		throw new Grib2FetchError(`Request failed: ${url}`, { cause });
	}
	if (!response.ok) {
		throw new Grib2FetchError(`Request failed (${response.status}): ${url}`);
	}
	return response.text();
}

/** Fetch the `.idx` sidecar for a full GRIB2 file. */
export async function fetchFieldIndex(
	fileUrl: string,
	deps: FetchDeps = {}
): Promise<ReturnType<typeof parseFieldIndex>> {
	return parseFieldIndex(await readText(`${fileUrl}.idx`, deps));
}

/** Fetch + decode a single indexed field of a full GRIB2 file by byte Range. */
export async function fetchIndexedField(
	fileUrl: string,
	query: IndexQuery,
	deps: FetchDeps = {}
): Promise<GribField> {
	const entries = await fetchFieldIndex(fileUrl, deps);
	const entry = selectIndexEntry(entries, query);
	if (!entry) {
		throw new Grib2FetchError(`No indexed field matching ${query.var} in ${fileUrl}`);
	}
	const bytes = await readBytes(fileUrl, { ...deps, headers: { Range: byteRange(entry).header } });
	return decodeField(bytes);
}

/** Fetch a Grib Filter subset and decode every returned field. */
export async function fetchSubsetFields(
	params: WaveSubsetParams,
	deps: FetchDeps = {}
): Promise<GribField[]> {
	const bytes = await readBytes(buildNomadsWaveUrl(params), deps);
	return decodeFields(bytes);
}
