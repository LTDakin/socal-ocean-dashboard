/**
 * `lib/format` — the one owner of unit conversion and display strings
 * (`docs/frontend.md`). Data is SI end to end; components call in here rather
 * than converting inline, so a units toggle is a single change.
 *
 * Audience convention: surfers think in feet and mph, so `imperial` is the
 * default; `metric` is the optional toggle.
 */

/** The user's display preference. */
export type Units = 'imperial' | 'metric';

/** What every formatter returns when the value is missing. */
export const NO_VALUE = '—';

const FEET_PER_METER = 3.280839895013123;
const MPH_PER_MPS = 2.2369362920544025;
const KMH_PER_MPS = 3.6;
const COMPASS_POINTS = [
	'N',
	'NNE',
	'NE',
	'ENE',
	'E',
	'ESE',
	'SE',
	'SSE',
	'S',
	'SSW',
	'SW',
	'WSW',
	'W',
	'WNW',
	'NW',
	'NNW'
] as const;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function isFiniteNumber(value: number | null | undefined): value is number {
	return value !== null && value !== undefined && Number.isFinite(value);
}

function round(value: number, digits: number): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

/** Meters → feet. */
export function metersToFeet(m: number): number {
	return m * FEET_PER_METER;
}

/** Celsius → Fahrenheit. */
export function celsiusToFahrenheit(c: number): number {
	return (c * 9) / 5 + 32;
}

/** Truncate to one decimal for stable, dense display. */
export function formatHeight(m: number | null | undefined, units: Units): string {
	if (!isFiniteNumber(m)) return NO_VALUE;
	return units === 'imperial' ? `${round(m * FEET_PER_METER, 1)} ft` : `${round(m, 1)} m`;
}

/** Water level relative to MLLW, shown with a sign for direction of travel. */
export function formatWaterLevel(m: number | null | undefined, units: Units): string {
	if (!isFiniteNumber(m)) return NO_VALUE;
	const value = units === 'imperial' ? round(m * FEET_PER_METER, 1) : round(m, 1);
	const unit = units === 'imperial' ? 'ft' : 'm';
	return `${value > 0 ? '+' : ''}${value} ${unit}`;
}

/** Water temperature. */
export function formatTemperature(c: number | null | undefined, units: Units): string {
	if (!isFiniteNumber(c)) return NO_VALUE;
	return units === 'imperial' ? `${round(celsiusToFahrenheit(c), 1)} °F` : `${round(c, 1)} °C`;
}

/** Wind speed (metric input m·s⁻¹). */
export function formatSpeed(ms: number | null | undefined, units: Units): string {
	if (!isFiniteNumber(ms)) return NO_VALUE;
	return units === 'imperial'
		? `${Math.round(ms * MPH_PER_MPS)} mph`
		: `${Math.round(ms * KMH_PER_MPS)} km/h`;
}

/** Sixteen-point compass label for a "direction from" bearing, or `NO_VALUE`. */
export function ordinalDirection(deg: number | null | undefined): string {
	if (!isFiniteNumber(deg)) return NO_VALUE;
	const index = Math.round((((deg % 360) + 360) % 360) / 22.5) % COMPASS_POINTS.length;
	return COMPASS_POINTS[index];
}

/** e.g. `3.2 ft @ 12 s WSW`; degrades gracefully when parts are missing. */
export function formatSwell(
	heightM: number | null | undefined,
	periodS: number | null | undefined,
	dirDeg: number | null | undefined,
	units: Units
): string {
	const height = formatHeight(heightM, units);
	if (height === NO_VALUE) return NO_VALUE;
	const period = isFiniteNumber(periodS) ? ` @ ${round(periodS, 0)} s` : '';
	const direction = isFiniteNumber(dirDeg) ? ` ${ordinalDirection(dirDeg)}` : '';
	return `${height}${period}${direction}`;
}

/** `Title Case` for a hyphen/space separated slug. */
export function titleCase(value: string | null | undefined): string {
	if (!value) return NO_VALUE;
	return value
		.split(/[\s-]+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

const REGION_LABELS: Readonly<Record<string, string>> = {
	'san-diego': 'San Diego',
	orange: 'Orange County',
	'los-angeles': 'Los Angeles',
	ventura: 'Ventura',
	'channel-islands': 'Channel Islands',
	'santa-barbara': 'Santa Barbara'
};

/** Human label for a spot region slug (`orange` → `Orange County`). */
export function regionLabel(region: string | null | undefined): string {
	if (!region) return NO_VALUE;
	return REGION_LABELS[region] ?? titleCase(region);
}

/** Arrow for a tide trend. */
export function tideStateArrow(state: 'rising' | 'falling' | 'steady' | null | undefined): string {
	if (state === 'rising') return '↑';
	if (state === 'falling') return '↓';
	if (state === 'steady') return '→';
	return NO_VALUE;
}

/**
 * Compact age/distance string: `just now`, `12 min ago`, `3 hr ago`, `2 d ago`,
 * or `in 3 hr` for future instants (used for the next tide event).
 */
export function formatRelativeTime(
	iso: string | null | undefined,
	now: number = Date.now()
): string {
	if (!iso) return NO_VALUE;
	const ms = Date.parse(iso);
	if (!Number.isFinite(ms)) return NO_VALUE;

	const diff = now - ms;
	const past = diff >= 0;
	const abs = Math.abs(diff);

	let amount: string;
	if (abs < 45 * 1000) return 'just now';
	else if (abs < 90 * 1000) amount = '1 min';
	else if (abs < HOUR_MS) amount = `${Math.round(abs / MINUTE_MS)} min`;
	else if (abs < 90 * MINUTE_MS) amount = '1 hr';
	else if (abs < DAY_MS) amount = `${Math.round(abs / HOUR_MS)} hr`;
	else if (abs < 48 * HOUR_MS) amount = '1 d';
	else amount = `${Math.round(abs / DAY_MS)} d`;

	return past ? `${amount} ago` : `in ${amount}`;
}
