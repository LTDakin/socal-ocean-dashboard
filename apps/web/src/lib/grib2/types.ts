/**
 * `lib/grib2` — typed shapes for the GRIB2 decode seam.
 *
 * This module is the only place GRIB2 bytes are read (architecture decision #4);
 * provider adapters consume these types and never import the decoder. Longitudes
 * are normalized to [-180, 180) so grids line up with negative spot longitudes.
 */

/** A regular lat/lon grid: one latitude axis and one longitude axis. */
export interface GribGrid {
	rows: number;
	cols: number;
	/** Row latitudes in stored order (may ascend or descend). */
	latitude: number[];
	/** Column longitudes in stored order, normalized to [-180, 180). */
	longitude: number[];
	/** `true` when the 0th row is the northern-most (latitudes descend). */
	northUp: boolean;
	/** `false` for curvilinear/flattened grids, where the axes don't apply. */
	regular: boolean;
}

/** Everything about a decoded message except its value grid. */
export interface GribFieldMeta {
	/** gribberish message key; unique within a file. */
	key: string;
	/** Long variable name, e.g. `significantwaveheight`. */
	varName: string;
	/** WMO/NCEP abbreviation, e.g. `HTSGW`. */
	varAbbrev: string;
	/** Upstream units string, e.g. `m`, `s`, `degree`, `ms-1`. */
	units: string;
	/** Forecast valid time (ISO-8601 UTC) — the instant the values apply to. */
	validTime: string;
	/** Model run / reference time (ISO-8601 UTC). */
	modelRun: string;
	grid: GribGrid;
}

/** A decoded field: metadata plus its row-major value grid. */
export interface GribField extends GribFieldMeta {
	/** `rows * cols` values, row-major; `null` where a bitmap masks a point. */
	data: Array<number | null>;
}

/** Selects one field out of a decoded file. */
export interface FieldSelector {
	/** Variable abbreviation, e.g. `HTSGW` or `SWELL` (case-insensitive). */
	var: string;
	/** Picks among repeated variables (e.g. `SWELL` 1/2/3), in file order. */
	occurrence?: number;
}

/** A value sampled from a regular grid at the nearest point to a coordinate. */
export interface FieldSample {
	/** The sampled value, or `null` where the grid masks the point. */
	value: number | null;
	/** Grid indices of the sampled point. */
	row: number;
	col: number;
	/** Coordinates of the sampled grid point. */
	lat: number;
	lon: number;
}

/** Thrown when GRIB2 bytes can't be decoded, so failures never surface as NaN. */
export class Grib2DecodeError extends Error {
	constructor(message: string, options: { cause?: unknown } = {}) {
		super(message, { cause: options.cause });
		this.name = 'Grib2DecodeError';
	}
}

/** Thrown when a GRIB2 fetch fails or a requested field isn't in the index. */
export class Grib2FetchError extends Error {
	constructor(message: string, options: { cause?: unknown } = {}) {
		super(message, { cause: options.cause });
		this.name = 'Grib2FetchError';
	}
}
