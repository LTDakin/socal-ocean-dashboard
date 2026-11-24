/**
 * `lib/charts/wave.ts` — ECharts option for the 14-day wave/swell forecast.
 *
 * Kept as a pure function (like `charts/tide.ts`) so the chart shape is
 * testable and `WaveForecastChart.svelte` stays a thin shell. Heights are the
 * day's maxima; the period line rides a second axis so both stay readable.
 * Direction and the exact day live in the tooltip, never only on the chart
 * (`docs/frontend.md` → accessible charts).
 */
import type { EChartsCoreOption } from 'echarts/core';
import {
	formatDayLabel,
	formatFullDate,
	formatHeight,
	ordinalDirection,
	type Units
} from '../format';
import type { DailyWaveForecast } from '../../server/providers/gfswave';
import { DATA_COLORS, withAlpha } from '../theme/data-colors';

const WAVE_COLOR = DATA_COLORS.cyan;
const SWELL_COLOR = DATA_COLORS.cyanLight;
const PERIOD_COLOR = DATA_COLORS.yellow;
const AXIS_COLOR = withAlpha(DATA_COLORS.chartText, 0.35);
const LABEL_COLOR = DATA_COLORS.chartLabel;

interface TooltipParam {
	seriesName?: string;
	value?: unknown;
	dataIndex?: number;
}

/** Build the multi-series option for the daily forecast rows. */
export function buildWaveForecastOption(
	daily: readonly DailyWaveForecast[],
	units: Units
): EChartsCoreOption {
	const labels = daily.map((day) => formatDayLabel(day.date));
	const wave = daily.map((day) => day.maxWaveHeightM);
	const swell = daily.map((day) => day.maxSwellHeightM);
	const period = daily.map((day) => day.maxDominantPeriodS);

	return {
		animation: false,
		grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
		legend: {
			top: 0,
			icon: 'roundRect',
			itemWidth: 12,
			itemHeight: 8,
			textStyle: { color: LABEL_COLOR, fontSize: 11 },
			data: ['Wave', 'Swell', 'Period']
		},
		tooltip: {
			trigger: 'axis',
			backgroundColor: withAlpha(DATA_COLORS.chartSurface, 0.94),
			borderColor: withAlpha(DATA_COLORS.cyan, 0.35),
			borderWidth: 1,
			textStyle: { color: DATA_COLORS.chartText, fontSize: 11 },
			formatter: (params: unknown): string => {
				const list = Array.isArray(params) ? (params as TooltipParam[]) : [];
				const index = list[0]?.dataIndex ?? -1;
				const day = daily[index];
				if (!day) return '';
				const lines = [
					`<strong>${formatFullDate(day.date)}</strong>`,
					`Wave ${formatHeight(day.maxWaveHeightM, units)}`,
					`Swell ${formatHeight(day.maxSwellHeightM, units)}`
				];
				if (day.maxDominantPeriodS !== null)
					lines.push(`Period ${Math.round(day.maxDominantPeriodS)} s`);
				if (day.dominantDirectionDeg !== null) {
					lines.push(`Direction ${ordinalDirection(day.dominantDirectionDeg)}`);
				}
				if (day.surfScore !== null) lines.push(`Surf score ${day.surfScore.toFixed(1)}/10`);
				return lines.join('<br/>');
			}
		},
		xAxis: {
			type: 'category',
			data: labels,
			boundaryGap: true,
			axisLine: { lineStyle: { color: AXIS_COLOR } },
			axisTick: { show: false },
			axisLabel: { color: LABEL_COLOR, fontSize: 10, hideOverlap: true }
		},
		yAxis: [
			{
				type: 'value',
				name: units === 'imperial' ? 'ft' : 'm',
				nameTextStyle: { color: LABEL_COLOR, fontSize: 10 },
				splitLine: { lineStyle: { color: withAlpha(DATA_COLORS.chartText, 0.08) } },
				axisLabel: { color: LABEL_COLOR, fontSize: 10 }
			},
			{
				type: 'value',
				name: 's',
				nameTextStyle: { color: LABEL_COLOR, fontSize: 10 },
				splitLine: { show: false },
				axisLabel: { color: LABEL_COLOR, fontSize: 10 }
			}
		],
		series: [
			{
				name: 'Wave',
				type: 'bar',
				data: wave,
				itemStyle: { color: WAVE_COLOR, borderRadius: [2, 2, 0, 0] },
				barMaxWidth: 14
			},
			{
				name: 'Swell',
				type: 'bar',
				data: swell,
				itemStyle: { color: SWELL_COLOR, borderRadius: [2, 2, 0, 0] },
				barMaxWidth: 14
			},
			{
				name: 'Period',
				type: 'line',
				yAxisIndex: 1,
				data: period,
				smooth: 0.3,
				showSymbol: false,
				lineStyle: { width: 2, color: PERIOD_COLOR },
				itemStyle: { color: PERIOD_COLOR }
			}
		]
	} as EChartsCoreOption;
}
