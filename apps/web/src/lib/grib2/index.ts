/**
 * `lib/grib2` — the app's only seam over GRIB2 decoding (`@mattnucc/gribberish`).
 *
 * Provider adapters import from here, never the decoder directly, so the codec
 * stays swappable (architecture decision #4). See `docs/plan-m1-grib2.md`.
 */
export * from './types';
export { inspectFields, decodeFields, decodeField, selectField, sampleField } from './decode';
export * from './index-file';
export * from './fetch';
