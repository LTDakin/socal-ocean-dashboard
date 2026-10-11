import { describe, expect, it } from 'vitest';
import type { DailyWaveForecast } from '../providers/gfswave';
import type { TidePreviewPoint } from '../providers/overview';
import { buildTideCurveOption } from './tide';
import { buildWaveForecastOption } from './wave';

interface TooltipShape {
	formatter: (params: unknown) => string;
}

describe('buildWaveForecastOption', () => {
	const daily: DailyWaveForecast[] = [
		{
			date: '2026-10-11',
			maxWaveHeightM: 1.5,
			dominantDirectionDeg: 265,
			maxDominantPeriodS: 14,
			maxSwellHeightM: 1.2,
			swellPeriodS: 13,
			swellDirectionDeg: 265,
			sampleCount: 24,
			surfScore: 6.4,
			bestTimeWindow: '2026-10-11T15:00:00.000Z'
		},
		{
			date: '2026-10-12',
			maxWaveHeightM: 1.1,
			dominantDirectionDeg: 250,
			maxDominantPeriodS: 12,
			maxSwellHeightM: 0.9,
			swellPeriodS: 11,
			swellDirectionDeg: 250,
			sampleCount: 24,
			surfScore: 4.1,
			bestTimeWindow: '2026-10-12T09:00:00.000Z'
		}
	];

	it('renders wave/swell bars and a period line for each day', () => {
		const option = buildWaveForecastOption(daily, 'imperial') as {
			xAxis: { data: string[] };
			series: { name?: string; data: unknown[] }[];
		};

		expect(option.xAxis.data).toEqual(['Sun 11', 'Mon 12']);
		expect(option.series.map((series) => series.name)).toEqual(['Wave', 'Swell', 'Period']);
		expect(option.series[0].data).toEqual([1.5, 1.1]);
	});

	it('spells out height/period/direction/score in the tooltip', () => {
		const option = buildWaveForecastOption(daily, 'imperial') as { tooltip: TooltipShape };
		const html = option.tooltip.formatter([{ dataIndex: 0 }]);

		expect(html).toContain('Sun Oct 11');
		expect(html).toContain('Wave 4.9 ft');
		expect(html).toContain('Period 14 s');
		expect(html).toContain('Direction W');
		expect(html).toContain('Surf score 6.4/10');
	});
});

describe('buildTideCurveOption', () => {
	const points: TidePreviewPoint[] = [
		{ time: '2026-10-11T00:00:00.000Z', heightM: 1, highLow: null },
		{ time: '2026-10-11T06:00:00.000Z', heightM: 1.9, highLow: 'high' },
		{ time: '2026-10-11T12:00:00.000Z', heightM: 0.2, highLow: 'low' }
	];

	it('plots the curve and marks every high/low event', () => {
		const option = buildTideCurveOption(points, 'metric') as {
			series: { data: unknown[]; markPoint: { data: unknown[] } }[];
		};

		expect(option.series[0].data).toHaveLength(3);
		expect(option.series[0].markPoint.data).toHaveLength(2);
	});

	it('labels a high in the tooltip', () => {
		const option = buildTideCurveOption(points, 'metric') as { tooltip: TooltipShape };
		const value = [Date.parse('2026-10-11T06:00:00.000Z'), 1.9];
		const html = option.tooltip.formatter([{ value }]);

		expect(html).toContain('High tide');
		expect(html).toContain('1.9 m');
	});
});
