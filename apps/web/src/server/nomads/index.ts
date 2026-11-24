/**
 * `server/nomads` — NOMADS-specific URL builders and upstream fetchers.
 *
 * Server-only: these helpers know the NOAA hostnames and perform network I/O.
 * The format-agnostic GRIB2 decoder stays in `lib/grib2`.
 */
export * from './fetch';
