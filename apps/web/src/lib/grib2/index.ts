/**
 * `lib/grib2` — the app's only seam over GRIB2 decoding (`@mattnucc/gribberish`).
 *
 * Provider adapters import from here, never the decoder directly, so the codec
 * stays swappable (architecture decision #4). See this directory's `README.md`.
 * NOAA/NOMADS URL building and fetching live in `server/nomads`, keeping this
 * seam format-only.
 */
export * from './types';
export { inspectFields, decodeFields, decodeField, selectField, sampleField } from './decode';
export * from './index-file';
