/**
 * `lib/grib2/decode.ts` — wrap `@mattnucc/gribberish` behind typed fields.
 *
 * Two access styles, matching how the wave adapter uses NOMADS:
 *
 * - `inspectFields(bytes)` scans metadata only, so a multi-hundred-field file can
 *   be indexed without paying to decode every value grid.
 * - `decodeFields(bytes)` / `decodeField(bytes)` decode values — all messages at
 *   once, or a single HTTP-Range-fetched message.
 *
 * Bitmap-masked points (land, out-of-domain) become `null`; a genuine decode
 * failure throws `Grib2DecodeError` rather than returning a grid of NaN.
 */
import {
	GribMessage,
	GribMessageMetadataFactory,
	parseMessagesFromBuffer
} from '@mattnucc/gribberish';
import {
	Grib2DecodeError,
	type FieldSample,
	type FieldSelector,
	type GribField,
	type GribFieldMeta,
	type GribGrid
} from './types';

/** `[0, 360)` → `[-180, 180)`, so wcoast longitudes match spot coordinates. */
function toSignedLongitude(longitude: number): number {
	return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function toGrid(message: GribMessage): GribGrid {
	const { rows, cols } = message.gridShape;
	const rawLat = message.latlng.latitude;
	const rawLon = message.latlng.longitude;
	const regular = rawLat.length === rows && rawLon.length === cols;
	const latitude = regular ? rawLat : Array.from(rawLat);
	const longitude = (regular ? rawLon : Array.from(rawLon)).map(toSignedLongitude);
	const northUp = latitude.length < 2 ? true : latitude[0] > latitude[latitude.length - 1];
	return { rows, cols, latitude, longitude, northUp, regular };
}

function toMeta(message: GribMessage): GribFieldMeta {
	return {
		key: message.key,
		varName: message.varName,
		varAbbrev: message.varAbbrev,
		units: message.units,
		validTime: message.forecastDate.toISOString(),
		modelRun: message.referenceDate.toISOString(),
		grid: toGrid(message)
	};
}

/** Masked / non-finite values become `null` so downstream math never sees NaN. */
function toValues(data: Array<number>): Array<number | null> {
	return data.map((value) => (Number.isFinite(value) ? value : null));
}

function toField(message: GribMessage): GribField {
	const meta = toMeta(message);
	let raw: Array<number>;
	try {
		raw = message.data;
	} catch (cause) {
		throw new Grib2DecodeError(
			`Failed to decode ${meta.varAbbrev} @ ${meta.validTime} (${meta.key})`,
			{ cause }
		);
	}
	return { ...meta, data: toValues(raw) };
}

/** Metadata-only scan of every message in a GRIB2 buffer (cheap). */
export function inspectFields(bytes: Uint8Array): GribFieldMeta[] {
	try {
		const factory = GribMessageMetadataFactory.fromBuffer(bytes);
		return factory.availableMessages.map((key) => toMeta(factory.getMessage(key)));
	} catch (cause) {
		throw new Grib2DecodeError('Failed to inspect GRIB2 messages', { cause });
	}
}

/** Decode every message in a GRIB2 buffer into typed fields. */
export function decodeFields(bytes: Uint8Array): GribField[] {
	let messages: GribMessage[];
	try {
		messages = parseMessagesFromBuffer(bytes);
	} catch (cause) {
		throw new Grib2DecodeError('Failed to parse GRIB2 messages', { cause });
	}
	return messages.map(toField);
}

/**
 * Decode a buffer that holds exactly one GRIB2 message — e.g. a single field
 * fetched by HTTP Range using the `.idx` sidecar.
 */
export function decodeField(bytes: Uint8Array): GribField {
	let message: GribMessage;
	try {
		message = GribMessage.parseFromBuffer(bytes, 0);
	} catch (cause) {
		throw new Grib2DecodeError('Failed to parse a single GRIB2 message', { cause });
	}
	return toField(message);
}

/**
 * Pick one field by abbreviation. `occurrence` (0-based, file order) resolves
 * repeats such as `SWELL` 1/2/3; omit it to take the first match.
 */
export function selectField<T extends GribFieldMeta>(
	fields: readonly T[],
	selector: FieldSelector
): T | undefined {
	const wanted = selector.var.toUpperCase();
	const matches = fields.filter((field) => field.varAbbrev.toUpperCase() === wanted);
	if (matches.length === 0) return undefined;
	return matches[selector.occurrence ?? 0];
}

/** Index of the axis entry nearest `target`, weighting longitude by `cos(lat)`. */
function nearestIndex(axis: number[], target: number, scale: number): number {
	let best = 0;
	let bestDistance = Infinity;
	for (let i = 0; i < axis.length; i += 1) {
		const distance = Math.abs((axis[i] - target) * scale);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = i;
		}
	}
	return best;
}

/**
 * Sample the nearest regular-grid point to a coordinate. Returns `undefined` for
 * curvilinear grids (which have no independent lat/lon axes).
 */
export function sampleField(field: GribField, lat: number, lon: number): FieldSample | undefined {
	const { grid } = field;
	if (!grid.regular || grid.latitude.length === 0 || grid.longitude.length === 0) {
		return undefined;
	}
	const row = nearestIndex(grid.latitude, lat, 1);
	const col = nearestIndex(grid.longitude, lon, Math.cos((lat * Math.PI) / 180));
	const index = row * grid.cols + col;
	const value = field.data[index];
	return {
		value: value === undefined ? null : value,
		row,
		col,
		lat: grid.latitude[row],
		lon: grid.longitude[col]
	};
}
