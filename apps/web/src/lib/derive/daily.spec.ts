import { describe, expect, it } from 'vitest';
import { aggregateDaily, type DailyWavePoint } from './daily';

function point(overrides: Partial<DailyWavePoint> & { time: string }): DailyWavePoint {
	return {
		waveHeightM: null,
		dominantPeriodS: null,
		dominantDirectionDeg: null,
		swellHeightM: null,
		swellPeriodS: null,
		swellDirectionDeg: null,
		...overrides
	};
}

describe('aggregateDaily', () => {
	it('groups by UTC date and takes the per-day extremes', () => {
		const daily = aggregateDaily([
			point({
				time: '2026-10-11T00:00:00Z',
				waveHeightM: 1,
				dominantPeriodS: 10,
				dominantDirectionDeg: 200,
				swellHeightM: 0.5,
				swellPeriodS: 12,
				swellDirectionDeg: 210
			}),
			point({
				time: '2026-10-11T12:00:00Z',
				waveHeightM: 2,
				dominantPeriodS: 14,
				dominantDirectionDeg: 210,
				swellHeightM: 1.2,
				swellPeriodS: 16,
				swellDirectionDeg: 220
			}),
			point({ time: '2026-10-12T00:00:00Z', waveHeightM: 0.8, dominantPeriodS: 9 })
		]);

		expect(daily).toHaveLength(2);
		expect(daily[0]).toEqual({
			date: '2026-10-11',
			maxWaveHeightM: 2,
			dominantDirectionDeg: 210,
			maxDominantPeriodS: 14,
			maxSwellHeightM: 1.2,
			swellPeriodS: 16,
			swellDirectionDeg: 220,
			sampleCount: 2
		});
		expect(daily[1]).toMatchObject({
			date: '2026-10-12',
			maxWaveHeightM: 0.8,
			maxSwellHeightM: null,
			sampleCount: 1
		});
	});

	it('keeps nulls when a day has no finite values', () => {
		const daily = aggregateDaily([point({ time: '2026-10-11T06:00:00Z' })]);
		expect(daily).toEqual([
			{
				date: '2026-10-11',
				maxWaveHeightM: null,
				dominantDirectionDeg: null,
				maxDominantPeriodS: null,
				maxSwellHeightM: null,
				swellPeriodS: null,
				swellDirectionDeg: null,
				sampleCount: 1
			}
		]);
	});

	it('returns [] for empty input and skips unparseable times, sorted by date', () => {
		expect(aggregateDaily([])).toEqual([]);
		const daily = aggregateDaily([
			point({ time: 'not-a-date', waveHeightM: 9 }),
			point({ time: '2026-10-13T00:00:00Z', waveHeightM: 1 }),
			point({ time: '2026-10-11T00:00:00Z', waveHeightM: 2 })
		]);
		expect(daily.map((day) => day.date)).toEqual(['2026-10-11', '2026-10-13']);
	});
});
