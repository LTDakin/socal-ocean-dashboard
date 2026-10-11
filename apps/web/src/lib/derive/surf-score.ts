/**
 * `lib/derive/surf-score.ts` — the experimental surf score (0-10).
 *
 * A deterministic, pure function of the swell/wind a spot sees plus the spot's
 * exposure. Kept in `lib/derive` (not the GFS-Wave adapter) so the formula and
 * its thresholds can be reasoned about and unit-tested in isolation, per
 * `AGENTS.md`. The score is v1-experimental (`docs/data-sources.md`): every
 * threshold is a config knob and the raw components are exposed for the UI.
 */

/** One point's worth of inputs. SI; directions are compass degrees the swell/wind come *from*. */
export interface SurfScoreInput {
	/** Significant height of the dominant swell partition (m). */
	swellHeightM: number | null;
	/** Period of the dominant swell partition (s). */
	swellPeriodS: number | null;
	/** Direction the dominant swell comes from (deg). */
	swellDirectionDeg: number | null;
	/** Wind speed (m·s⁻¹). */
	windSpeedMs: number | null;
	/** Direction the wind comes from (deg). */
	windDirectionDeg: number | null;
	/** Tide height (m, MLLW). Optional; weighted `0` by default (see config). */
	tideHeightM?: number | null;
	/** Compass heading of the open-ocean direction the spot faces (deg). */
	exposureDeg: number | null;
}

/** Per-component quality in `0..1`, or `null` when the component can't be computed. */
export interface SurfScoreComponents {
	size: number | null;
	period: number | null;
	direction: number | null;
	wind: number | null;
	tide: number | null;
}

/** Tunable thresholds + weights. Weights need not sum to 1 — missing inputs renormalize. */
export interface SurfScoreConfig {
	weights: {
		size: number;
		period: number;
		direction: number;
		wind: number;
		/** `0` in v1 until per-spot tide preferences + CO-OPS water levels land. */
		tide: number;
	};
	size: {
		/** Swell height (m) scoring `0`. */
		minM: number;
		/** Swell height (m) scoring `1`; larger saturates. */
		idealM: number;
	};
	period: {
		/** Swell period (s) scoring `0`. */
		minS: number;
		/** Swell period (s) scoring `1`; longer saturates. */
		idealS: number;
	};
	direction: {
		/** Angular gap (deg) between swell and spot exposure that scores `0`. */
		maxOffsetDeg: number;
	};
	wind: {
		/** Wind speed (m·s⁻¹) at which direction takes over completely. */
		strongMs: number;
		/** Quality of calm wind regardless of direction (`0..1`). */
		calmQuality: number;
	};
	tide: {
		/** Preferred tide height (m) for the spot. */
		idealM: number;
		/** Tide offset (m) from `idealM` that scores `0`. */
		toleranceM: number;
	};
}

/** v1 defaults — deliberately boring, tune with the surfers. */
export const DEFAULT_SURF_SCORE_CONFIG: SurfScoreConfig = {
	weights: { size: 0.35, period: 0.25, direction: 0.25, wind: 0.15, tide: 0 },
	size: { minM: 0.3, idealM: 3.0 },
	period: { minS: 7, idealS: 18 },
	direction: { maxOffsetDeg: 90 },
	wind: { strongMs: 10, calmQuality: 0.6 },
	tide: { idealM: 1.0, toleranceM: 1.5 }
};

/** The surf score with its component breakdown, for debugging and UI tooltips. */
export interface SurfScoreResult {
	/** Weighted score in `0..10`, or `null` when nothing was computable. */
	score: number | null;
	components: SurfScoreComponents;
}

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

function isFiniteNumber(value: number | null | undefined): value is number {
	return value !== null && value !== undefined && Number.isFinite(value);
}

/** Smallest absolute angle (0..180°) between two compass directions. */
export function angleBetweenDeg(a: number, b: number): number {
	const delta = Math.abs(((a - b) % 360) + 360) % 360;
	return delta > 180 ? 360 - delta : delta;
}

/** Linear ramp from `min` (0) to `ideal` (1), clamped. */
function ramp(value: number, min: number, ideal: number): number {
	if (ideal === min) return value >= ideal ? 1 : 0;
	return clamp01((value - min) / (ideal - min));
}

function sizeComponent(input: SurfScoreInput, config: SurfScoreConfig): number | null {
	if (!isFiniteNumber(input.swellHeightM)) return null;
	return ramp(input.swellHeightM, config.size.minM, config.size.idealM);
}

function periodComponent(input: SurfScoreInput, config: SurfScoreConfig): number | null {
	if (!isFiniteNumber(input.swellPeriodS)) return null;
	return ramp(input.swellPeriodS, config.period.minS, config.period.idealS);
}

function directionComponent(input: SurfScoreInput, config: SurfScoreConfig): number | null {
	if (!isFiniteNumber(input.swellDirectionDeg) || !isFiniteNumber(input.exposureDeg)) return null;
	const gap = angleBetweenDeg(input.swellDirectionDeg, input.exposureDeg);
	return clamp01(1 - gap / config.direction.maxOffsetDeg);
}

function windComponent(input: SurfScoreInput, config: SurfScoreConfig): number | null {
	if (!isFiniteNumber(input.windSpeedMs)) return null;
	// Offshore wind blows from the land, i.e. opposite the spot's exposure.
	const directionQuality =
		isFiniteNumber(input.windDirectionDeg) && isFiniteNumber(input.exposureDeg)
			? (Math.cos(
					(angleBetweenDeg(input.windDirectionDeg, input.exposureDeg + 180) * Math.PI) / 180
				) +
					1) /
				2
			: 0.5;
	const strength = clamp01(input.windSpeedMs / config.wind.strongMs);
	return clamp01((1 - strength) * config.wind.calmQuality + strength * directionQuality);
}

function tideComponent(input: SurfScoreInput, config: SurfScoreConfig): number | null {
	if (!isFiniteNumber(input.tideHeightM)) return null;
	return clamp01(1 - Math.abs(input.tideHeightM - config.tide.idealM) / config.tide.toleranceM);
}

/**
 * Component qualities plus the weighted `0..10` score.
 *
 * Each component returns `null` when its inputs are missing; those components
 * (and their weights) are dropped, and the remaining weights are renormalized so
 * a partial sample never silently reads as "flat". `score` is `null` only when
 * *no* component is computable.
 */
export function scoreSurfComponents(
	input: SurfScoreInput,
	config: SurfScoreConfig = DEFAULT_SURF_SCORE_CONFIG
): SurfScoreResult {
	const components: SurfScoreComponents = {
		size: sizeComponent(input, config),
		period: periodComponent(input, config),
		direction: directionComponent(input, config),
		wind: windComponent(input, config),
		tide: tideComponent(input, config)
	};

	let weighted = 0;
	let weightSum = 0;
	for (const key of Object.keys(components) as (keyof SurfScoreComponents)[]) {
		const value = components[key];
		const weight = config.weights[key];
		if (value === null || weight <= 0) continue;
		weighted += value * weight;
		weightSum += weight;
	}

	return { score: weightSum > 0 ? (weighted / weightSum) * 10 : null, components };
}

/** Convenience: just the `0..10` score, or `null` when unscoreable. */
export function scoreSurf(
	input: SurfScoreInput,
	config: SurfScoreConfig = DEFAULT_SURF_SCORE_CONFIG
): number | null {
	return scoreSurfComponents(input, config).score;
}

/** An hourly scoring input carrying its instant, for per-day aggregation. */
export interface SurfScoreTimedInput extends SurfScoreInput {
	/** ISO-8601 UTC instant; the UTC date is the aggregation bucket. */
	time: string;
}

/** The best-scoring hour in one UTC day: drives the strip and `bestTimeWindow`. */
export interface DailySurfScore {
	/** `YYYY-MM-DD` (UTC). */
	date: string;
	/** Best hourly score that day (0-10), or `null` when no hour was scoreable. */
	surfScore: number | null;
	/** ISO instant of the hour that produced `surfScore`, or `null`. */
	bestTimeWindow: string | null;
	/** Component breakdown of the best hour, or `null`. */
	components: SurfScoreComponents | null;
}

/** UTC calendar date of an ISO instant, or `null` if unparseable. */
function utcDate(time: string): string | null {
	const ms = Date.parse(time);
	return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

/**
 * Group an hourly series into one best-scoring hour per UTC day.
 *
 * The forecast contract's `daily[]` carries a `surfScore` (0-10) and the
 * `bestTimeWindow` that produced it. A day's score is its single best hour
 * (highest score; ties keep the earlier hour), which reads truer to a surfer
 * than a daily average. Days with no scoreable hour keep a `null` row so the
 * strip still shows the calendar. Points with an unparseable `time` are skipped.
 */
export function scoreSurfByDay(
	points: readonly SurfScoreTimedInput[],
	config: SurfScoreConfig = DEFAULT_SURF_SCORE_CONFIG
): DailySurfScore[] {
	const days = new Map<string, DailySurfScore>();

	for (const point of points) {
		const date = utcDate(point.time);
		if (!date) continue;

		const result = scoreSurfComponents(point, config);
		const existing = days.get(date);
		if (result.score === null) {
			if (!existing) {
				days.set(date, { date, surfScore: null, bestTimeWindow: null, components: null });
			}
			continue;
		}
		if (!existing || existing.surfScore === null || result.score > existing.surfScore) {
			days.set(date, {
				date,
				surfScore: result.score,
				bestTimeWindow: point.time,
				components: result.components
			});
		}
	}

	return [...days.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
