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
	DailyWaveForecast,
	GfsWaveAdapterOptions,
	GfsWaveForecast,
	GfsWaveSource,
	NomadsSourceOptions,
	SwellPartition,
	WaveHourlyPoint
} from './gfswave';
export {
	buildCoopsPredictionsUrl,
	buildTidePredictions,
	createCoopsAdapter,
	createCoopsSource,
	parseCoopsTime,
	COOPS_DATAGETTER_URL,
	COOPS_PROVIDER_ID,
	COOPS_STALE_TTL_MS,
	COOPS_TTL_MS
} from './coops';
export type {
	CoopsAdapterOptions,
	CoopsFetchLike,
	CoopsInterval,
	CoopsSource,
	CoopsSourceOptions,
	CoopsTides,
	RawTidePrediction,
	TidePrediction
} from './coops';
export {
	cdipAdapter,
	coastwatchAdapter,
	coopsAdapter,
	coopsObsAdapter,
	gfsWaveAdapter,
	getSpotClarity,
	getSpotCurrent,
	getSpotForecast,
	getSpotsOverview,
	getSpotTides,
	ndbcAdapter,
	providerCache,
	spotDataService
} from './registry';
export type {
	ClarityEnvelope,
	CurrentBundle,
	CurrentEnvelope,
	ForecastEnvelope,
	GetSpotClarityOptions,
	GetSpotCurrentOptions,
	GetSpotForecastOptions,
	GetSpotsOverviewOptions,
	SpotsOverviewEnvelope,
	TidesEnvelope
} from './registry';
export {
	assembleSpotsOverview,
	buildSpotOverview,
	buildTidePreview,
	tidePreviewWindow,
	TIDE_PREVIEW_HOURS,
	TIDE_PREVIEW_STEP_HOURS
} from './overview';
export type {
	SpotOverview,
	SpotOverviewEntry,
	SpotSnapshot,
	SpotsOverviewData,
	TidePreviewPoint
} from './overview';
export { mergeSourceRecords } from './sources';
export {
	buildCdipWaveUrl,
	createCdipAdapter,
	createCdipSource,
	parseCdipWave,
	CDIP_ERDDAP_URL,
	CDIP_PROVIDER_ID,
	CDIP_STALE_TTL_MS,
	CDIP_TTL_MS,
	CDIP_WAVE_DATASET,
	CDIP_WAVE_VARIABLES
} from './cdip';
export type {
	CdipAdapterOptions,
	CdipFetchLike,
	CdipObservations,
	CdipSource,
	CdipSourceOptions,
	WaveObservation
} from './cdip';
export {
	buildNdbcRealtimeUrl,
	createNdbcAdapter,
	createNdbcSource,
	ndbcTwinForCdipBuoy,
	parseNdbcRealtime2,
	CDIP_NDBC_TWINS,
	NDBC_PROVIDER_ID,
	NDBC_REALTIME_URL,
	NDBC_STALE_TTL_MS,
	NDBC_TTL_MS
} from './ndbc';
export type {
	NdbcAdapterOptions,
	NdbcFetchLike,
	NdbcObservation,
	NdbcObservations,
	NdbcSource,
	NdbcSourceOptions
} from './ndbc';
export {
	buildCoopsObservationUrl,
	buildCoopsObservations,
	computeTideTrend,
	createCoopsObsAdapter,
	createCoopsObsSource,
	COOPS_OBS_PROVIDER_ID,
	COOPS_OBS_STALE_TTL_MS,
	COOPS_OBS_TTL_MS,
	TIDE_STEADY_THRESHOLD_MPER_HOUR
} from './coops-obs';
export type {
	CoopsObservationProduct,
	CoopsObservations,
	CoopsObsAdapterOptions,
	CoopsObsFetchLike,
	CoopsObsSource,
	CoopsObsSourceOptions,
	RawCoopsObservation,
	TideTrend
} from './coops-obs';
export { buildCurrentConditions, observationWindow, OBSERVATION_LOOKBACK_MS } from './current';
export type {
	CurrentConditions,
	CurrentField,
	FieldProvenance,
	ObservationBundle
} from './current';
export {
	buildCoastwatchKd490Url,
	clarityWindow,
	createCoastwatchAdapter,
	createCoastwatchSource,
	parseCoastwatchKd490,
	toClarityObservation,
	CLARITY_LOOKBACK_DAYS,
	COASTWATCH_ERDDAP_URL,
	COASTWATCH_KD490_DATASET,
	COASTWATCH_KD490_VARIABLE,
	COASTWATCH_PROVIDER_ID,
	COASTWATCH_STALE_TTL_MS,
	COASTWATCH_TTL_MS
} from './coastwatch';
export type {
	ClarityObservation,
	CoastwatchAdapterOptions,
	CoastwatchFetchLike,
	CoastwatchSource,
	CoastwatchSourceOptions,
	Kd490Observation,
	PixelLocation
} from './coastwatch';
