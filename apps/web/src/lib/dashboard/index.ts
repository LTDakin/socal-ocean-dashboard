/**
 * `lib/dashboard` — client-safe wire shapes and pure helpers for the dashboard.
 *
 * The browser imports from here; the BFF imports from here too. Everything under
 * `src/server/providers` is server-only, so no upstream fetch can reach the
 * client bundle through this entry point.
 */
export { compareSpotsByInfo, spotInfoScore } from './spot-ranking';
export {
	buildTidePreview,
	tidePreviewWindow,
	TIDE_PREVIEW_HOURS,
	TIDE_PREVIEW_STEP_HOURS
} from './tide-preview';
export type {
	ForecastWindow,
	SpotOverview,
	SpotSnapshot,
	TidePrediction,
	TidePreviewPoint
} from './types';
