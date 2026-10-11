/**
 * `lib/grib2/index-file.ts` — wgrib2 `.idx` sidecars and byte ranges.
 *
 * NOMADS publishes a `.idx` next to every GRIB2 file listing each message's byte
 * offset. Parsing it lets the adapter fetch a single field with an HTTP Range
 * request instead of downloading a multi-hundred-MB file.
 */
import { parseGribIndex, type GribIndexEntry } from '@mattnucc/gribberish';
import { Grib2DecodeError } from './types';

export type { GribIndexEntry };

/** How to pick one message out of an index. */
export interface IndexQuery {
	/** Variable abbreviation, e.g. `HTSGW` (case-insensitive). */
	var: string;
	/** Level, verbatim, e.g. `surface` or `1 in sequence`. */
	level?: string;
	/** Forecast time, verbatim, e.g. `anl` or `6 hour fcst`. */
	forecastTime?: string;
}

/** A resolved byte range for one indexed message. */
export interface IndexedByteRange {
	start: number;
	/** Inclusive end; omitted for the final open-ended message. */
	end?: number;
	/** `Range` request header value, e.g. `bytes=71276-82194`. */
	header: string;
}

/**
 * Parse a `.idx` / `.index` sidecar. Pass the GRIB file size (when known) to size
 * the final NOAA entry, which otherwise has no explicit length.
 */
export function parseFieldIndex(text: string, fileSize?: number): GribIndexEntry[] {
	try {
		return parseGribIndex(text, fileSize);
	} catch (cause) {
		throw new Grib2DecodeError('Failed to parse a GRIB index sidecar', { cause });
	}
}

/** First index entry matching the query, or `undefined`. */
export function selectIndexEntry(
	entries: readonly GribIndexEntry[],
	query: IndexQuery
): GribIndexEntry | undefined {
	const wanted = query.var.toUpperCase();
	return entries.find(
		(entry) =>
			entry.var?.toUpperCase() === wanted &&
			(query.level === undefined || entry.level === query.level) &&
			(query.forecastTime === undefined || entry.forecastTime === query.forecastTime)
	);
}

/**
 * Byte range for one entry. The last entry of a NOAA index has no length unless
 * the file size was supplied, so it resolves to an open-ended `bytes=N-`.
 */
export function byteRange(entry: GribIndexEntry): IndexedByteRange {
	const start = entry.offset;
	if (entry.length !== undefined && entry.length > 0) {
		const end = start + entry.length - 1;
		return { start, end, header: `bytes=${start}-${end}` };
	}
	return { start, header: `bytes=${start}-` };
}
