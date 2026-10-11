/**
 * `lib/derive/daily.ts` — daily aggregation of an hourly wave series.
 *
 * Deterministic and side-effect free: the wave adapter feeds it a sampled hourly
 * series and gets the per-day extremes the forecast contract's `daily[]` needs.
 * Kept in `lib/derive` (not the adapter) so derived metrics can be reasoned
 * about — and unit-tested — in isolation, per `AGENTS.md`.
 */

/** The hourly inputs a daily wave summary is built from. All values SI. */
export interface DailyWavePoint {
	/** ISO-8601 UTC instant; the UTC date is the aggregation bucket. */
	time: string;
	waveHeightM: number | null;
	dominantPeriodS: number | null;
	dominantDirectionDeg: number | null;
	swellHeightM: number | null;
	swellPeriodS: number | null;
	swellDirectionDeg: number | null;
}

/** Per-day extremes for one spot. Directions are the values at the day's peak. */
export interface DailyWaveSummary {
	/** `YYYY-MM-DD` (UTC). */
	date: string;
	maxWaveHeightM: number | null;
	/** Dominant direction (deg) at the day's max wave height. */
	dominantDirectionDeg: number | null;
	maxDominantPeriodS: number | null;
	maxSwellHeightM: number | null;
	/** Period (s) of the day's largest swell partition. */
	swellPeriodS: number | null;
	/** Direction (deg) of the day's largest swell partition. */
	swellDirectionDeg: number | null;
	/** How many hourly samples fed this day (trust signal for the UI). */
	sampleCount: number;
}

interface Peak {
	value: number;
	directionDeg: number | null;
	periodS: number | null;
}

interface Accumulator {
	date: string;
	wave: Peak | null;
	swell: Peak | null;
	maxDominantPeriodS: number | null;
	sampleCount: number;
}

function isGreater(candidate: number | null, current: number | null): boolean {
	return candidate !== null && (current === null || candidate > current);
}

function maxOrNull(candidate: number | null, current: number | null): number | null {
	return isGreater(candidate, current) ? candidate : current;
}

/** UTC calendar date of an ISO instant, or `undefined` if unparseable. */
function utcDate(time: string): string | undefined {
	const ms = Date.parse(time);
	if (!Number.isFinite(ms)) return undefined;
	return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Group an hourly series into per-day extremes, sorted by date. Points with an
 * unparseable `time` are skipped; empty input yields an empty array.
 */
export function aggregateDaily(points: readonly DailyWavePoint[]): DailyWaveSummary[] {
	const days = new Map<string, Accumulator>();

	for (const point of points) {
		const date = utcDate(point.time);
		if (!date) continue;

		const day = days.get(date) ?? {
			date,
			wave: null,
			swell: null,
			maxDominantPeriodS: null,
			sampleCount: 0
		};
		days.set(date, day);
		day.sampleCount += 1;
		day.maxDominantPeriodS = maxOrNull(point.dominantPeriodS, day.maxDominantPeriodS);

		if (isGreater(point.waveHeightM, day.wave?.value ?? null)) {
			day.wave = {
				value: point.waveHeightM as number,
				directionDeg: point.dominantDirectionDeg,
				periodS: point.dominantPeriodS
			};
		}
		if (isGreater(point.swellHeightM, day.swell?.value ?? null)) {
			day.swell = {
				value: point.swellHeightM as number,
				directionDeg: point.swellDirectionDeg,
				periodS: point.swellPeriodS
			};
		}
	}

	return [...days.values()]
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
		.map((day) => ({
			date: day.date,
			maxWaveHeightM: day.wave?.value ?? null,
			dominantDirectionDeg: day.wave?.directionDeg ?? null,
			maxDominantPeriodS: day.maxDominantPeriodS,
			maxSwellHeightM: day.swell?.value ?? null,
			swellPeriodS: day.swell?.periodS ?? null,
			swellDirectionDeg: day.swell?.directionDeg ?? null,
			sampleCount: day.sampleCount
		}));
}
