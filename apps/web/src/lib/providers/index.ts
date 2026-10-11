/**
 * `lib/providers` — provider adapter contract, cache-backed orchestrator, the
 * response envelope, and the registered real adapters. Public entry point for
 * the BFF core.
 *
 * The stub adapter proves the seam in tests; real adapters (GFS-Wave now; CDIP,
 * CO-OPS, NDBC, CoastWatch later) register against the shared cache in
 * `registry.ts`.
 */
export * from './types';
export { SpotDataService, createSpotDataService } from './service';
export type { GetSpotDataOptions, SpotDataServiceOptions } from './service';
export { buildStubSlide, createStubAdapter } from './stub';
export type { StubPoint, StubSlide } from './stub';
export {
	buildGfsWaveForecast,
	createGfsWaveAdapter,
	createNomadsSource,
	defaultForecastWindow,
	latestModelCycle,
	sampleWavePoint,
	selectForecastHours,
	GFSWAVE_PROVIDER_ID,
	GFSWAVE_STALE_TTL_MS,
	GFSWAVE_TTL_MS,
	GFSWAVE_VARIABLES,
	SO_CAL_REGION
} from './gfswave';
export type {
	BuildForecastInput,
	GfsWaveAdapterOptions,
	GfsWaveForecast,
	GfsWaveSource,
	NomadsSourceOptions,
	SwellPartition,
	WaveHourlyPoint
} from './gfswave';
export { gfsWaveAdapter, getSpotForecast, providerCache, spotDataService } from './registry';
export type { ForecastEnvelope, GetSpotForecastOptions } from './registry';
