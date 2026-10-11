/**
 * `lib/components/scales.ts` — the low→high display scales behind the "now"
 * panel's range meters (`ConditionsPanel.svelte`).
 *
 * Each current-conditions metric is plotted on a fixed, judgement-based scale so
 * a bare number ("12 mph") becomes a position ("strong for here"). Bounds are in
 * SI (the internal unit); band labels are the human reading. Colors avoid a
 * red/green-only encoding (`docs/frontend.md` → accessibility), and the meter
 * always keeps its number and end labels.
 */

/** The four metrics the "now" panel scales. */
export type ScaleKey = 'waves' | 'waterTemp' | 'wind' | 'waterLevel';

export interface MetricScale {
	/** Low end of the scale, in the metric's SI unit. */
	min: number;
	/** High end of the scale, in the metric's SI unit. */
	max: number;
}

export interface ScaleTheme {
	/** Solid color for the value marker and the band label. */
	accent: string;
	/** CSS gradient painted across the track, low end → high end. */
	track: string;
}

/**
 * Scale bounds, in SI. Judgement calls tuned to Southern California surf/dive
 * conditions:
 *   - waves: 0–12 ft (flat to well overhead)
 *   - water temp: 50–75 °F (cold upwelling to a warm late-summer afternoon)
 *   - wind: 0–25 mph (glassy to blown out)
 *   - water level: −2 to +8 ft relative to MLLW (king-tide low to high)
 */
export const SCALE_BOUNDS: Record<ScaleKey, MetricScale> = {
	waves: { min: 0, max: 3.66 },
	waterTemp: { min: 10, max: 23.9 },
	wind: { min: 0, max: 11.18 },
	waterLevel: { min: -0.61, max: 2.44 }
};

/**
 * Track gradients and marker accents. Gradients read low→high; no metric relies
 * on a red/green pair, and every band label sits next to the number.
 */
export const SCALE_THEMES: Record<ScaleKey, ScaleTheme> = {
	waves: {
		accent: '#4fb3d9',
		track: 'linear-gradient(90deg, #2b6f8f 0%, #4fb3d9 55%, #9fe0f5 100%)'
	},
	waterTemp: {
		accent: '#ffb56b',
		track: 'linear-gradient(90deg, #4f9fe0 0%, #7fd0c0 38%, #ffd479 68%, #ff9e5e 100%)'
	},
	wind: {
		accent: '#ffd479',
		track: 'linear-gradient(90deg, #7fe0c8 0%, #b8dc8a 45%, #ffd479 75%, #ff9e5e 100%)'
	},
	waterLevel: {
		accent: '#8b9ff0',
		track: 'linear-gradient(90deg, #3d5a9e 0%, #6b7fd7 55%, #a9baf5 100%)'
	}
};

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Where `value` sits on `key`'s scale: 0 (low) → 1 (high), clamped. */
export function scalePosition(value: number, key: ScaleKey): number {
	const { min, max } = SCALE_BOUNDS[key];
	if (max <= min) return 0;
	return clamp01((value - min) / (max - min));
}

/** First ascending threshold the value falls under, else the fallback band. */
function band(value: number, thresholds: readonly (readonly [number, string])[], fallback: string) {
	for (const [limit, label] of thresholds) {
		if (value < limit) return label;
	}
	return fallback;
}

/** Surf scale for significant wave height (input meters). */
export function wavesBand(heightM: number): string {
	return band(
		heightM,
		[
			[0.3, 'Flat'],
			[0.6, 'Ankle'],
			[0.9, 'Knee'],
			[1.2, 'Waist'],
			[1.8, 'Chest'],
			[2.4, 'Head'],
			[3.66, 'Overhead']
		],
		'XXL'
	);
}

/** Dive/surf comfort scale for water temperature (input °C). */
export function waterTempBand(c: number): string {
	return band(
		c,
		[
			[12, 'Cold'],
			[15, 'Cool'],
			[18, 'Mild'],
			[21, 'Warm']
		],
		'Toasty'
	);
}

/** Beaufort-flavoured wing strength (input m·s⁻¹). */
export function windBand(ms: number): string {
	return band(
		ms,
		[
			[1, 'Calm'],
			[4, 'Light'],
			[7, 'Moderate'],
			[10, 'Fresh']
		],
		'Strong'
	);
}

/** Where the tide sits on its range: low / mid / high (input meters, MLLW). */
export function waterLevelBand(m: number): string {
	const position = scalePosition(m, 'waterLevel');
	if (position < 1 / 3) return 'Low';
	if (position < 2 / 3) return 'Mid';
	return 'High';
}
