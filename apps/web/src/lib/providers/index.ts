/**
 * `lib/providers` — provider adapter contract, cache-backed orchestrator, and
 * the response envelope. Public entry point for the BFF core.
 *
 * Real adapters (GFS-Wave, CDIP, CO-OPS, NDBC, CoastWatch) register against the
 * shared cache in later milestones; the stub adapter proves the seam until then.
 */
import { TtlCache } from '../cache';

export * from './types';
export { SpotDataService, createSpotDataService } from './service';
export type { GetSpotDataOptions, SpotDataServiceOptions } from './service';
export { buildStubSlide, createStubAdapter } from './stub';
export type { StubPoint, StubSlide } from './stub';

/**
 * Process-wide cache shared by every provider adapter. TTLs are per-adapter
 * (they match upstream cadence, see `docs/data-sources.md`), so one cache
 * instance with per-entry windows is all the BFF core needs.
 */
export const providerCache = new TtlCache();
