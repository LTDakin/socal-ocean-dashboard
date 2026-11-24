/**
 * `lib/dashboard/tide-preview.ts` — pure tide-window and sparkline helpers.
 *
 * The BFF uses these to build `/api/spots` and the detail loader's compact curve;
 * the browser may use the same code to rebuild a preview from API data. No I/O,
 * no upstream knowledge — just ISO instants in, decimated points out.
 */
import type { ForecastWindow, TidePrediction, TidePreviewPoint } from './types';

const HOUR_MS = 60 * 60 * 1000;

/** How far ahead the card tide preview reaches (hours). */
export const TIDE_PREVIEW_HOURS = 24;
/** Preview curve decimation: keep the hourly curve only every N hours. */
export const TIDE_PREVIEW_STEP_HOURS = 3;

/** The preview window: the next `TIDE_PREVIEW_HOURS` from the next hour. */
export function tidePreviewWindow(now: number = Date.now()): ForecastWindow {
	const start = Math.ceil(now / HOUR_MS) * HOUR_MS;
	return {
		start: new Date(start).toISOString(),
		end: new Date(start + TIDE_PREVIEW_HOURS * HOUR_MS).toISOString()
	};
}

/**
 * Decimate a prediction series into a sparkline: every high/low event, plus the
 * hourly curve sampled every `stepHours` (on the hour). Extremes win on a tie so
 * a high that lands on a sampled hour keeps its flag. Clipped to `window`.
 */
export function buildTidePreview(
	predictions: readonly TidePrediction[],
	window: ForecastWindow,
	stepHours: number = TIDE_PREVIEW_STEP_HOURS
): TidePreviewPoint[] {
	const start = Date.parse(window.start);
	const end = Date.parse(window.end);
	const step = Math.max(1, Math.round(stepHours));
	const byTime = new Map<string, TidePreviewPoint>();

	for (const point of predictions) {
		const ms = Date.parse(point.time);
		if (!Number.isFinite(ms) || ms < start || ms > end) continue;
		const onGrid = Math.round(ms / HOUR_MS) % step === 0;
		const existing = byTime.get(point.time);
		if (point.highLow === null) {
			if (!onGrid || existing) continue;
		} else if (existing?.highLow) {
			continue;
		}
		byTime.set(point.time, { time: point.time, heightM: point.heightM, highLow: point.highLow });
	}

	return [...byTime.values()].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}
