/**
 * `lib/charts/tide.ts` — ECharts option for the compact card tide preview.
 *
 * Kept as a pure function so the chart shape is testable and the component stays
 * a thin shell around `Chart.svelte`.
 */
import type { EChartsCoreOption } from 'echarts/core';
import {
	formatClockTime,
	formatDayLabel,
	formatFullDate,
	formatHeight,
	type Units
} from '../format';
import type { TidePreviewPoint } from '../dashboard';
import { DATA_COLORS, withAlpha } from '../theme/data-colors';

const LINE_COLOR = DATA_COLORS.cyan;
const HIGH_COLOR = DATA_COLORS.chartText;
const LOW_COLOR = DATA_COLORS.cyanMuted;
const AXIS_COLOR = withAlpha(DATA_COLORS.chartText, 0.35);
const LABEL_COLOR = DATA_COLORS.chartLabel;

/** Build the sparkline option for a decimated tide preview (`TidePreviewPoint[]`). */
export function buildTideSparklineOption(
	points: readonly TidePreviewPoint[],
	units: Units
): EChartsCoreOption {
	const series = points.map((point) => [Date.parse(point.time), point.heightM] as [number, number]);
	const extremes = points
		.filter((point) => point.highLow !== null)
		.map((point) => ({
			coord: [Date.parse(point.time), point.heightM] as [number, number],
			itemStyle: { color: point.highLow === 'high' ? HIGH_COLOR : LOW_COLOR }
		}));

	return {
		animation: false,
		grid: { left: 2, right: 2, top: 8, bottom: 2, containLabel: false },
		xAxis: { type: 'time', show: false, boundaryGap: false },
		yAxis: { type: 'value', show: false, scale: true },
		tooltip: {
			trigger: 'axis',
			backgroundColor: withAlpha(DATA_COLORS.chartSurface, 0.94),
			borderColor: withAlpha(DATA_COLORS.cyan, 0.35),
			borderWidth: 1,
			textStyle: { color: DATA_COLORS.chartText, fontSize: 11 },
			formatter: (params: unknown): string => {
				const first = (Array.isArray(params) ? params[0] : params) as
					{ value?: unknown } | undefined;
				const value = Array.isArray(first?.value) ? first.value : undefined;
				if (!value) return '';
				const [time, height] = value as [number, number];
				const iso = new Date(time).toISOString();
				return `${formatDayLabel(iso)} ${formatClockTime(iso)} · ${formatHeight(height, units)}`;
			}
		},
		series: [
			{
				type: 'line',
				data: series,
				showSymbol: false,
				smooth: 0.35,
				lineStyle: { width: 2, color: LINE_COLOR },
				areaStyle: { color: withAlpha(DATA_COLORS.cyan, 0.18) },
				markPoint: {
					symbol: 'circle',
					symbolSize: 5,
					label: { show: false },
					data: extremes
				}
			}
		]
	} as EChartsCoreOption;
}

/**
 * Build the full, axis-labelled tide curve for the spot detail page.
 *
 * The `points` are a decimated preview (hourly curve + every high/low), the same
 * shape the card sparkline uses. High/low lands as labeled mark points; the
 * tooltip spells out the event so the curve is never the only source.
 */
export function buildTideCurveOption(
	points: readonly TidePreviewPoint[],
	units: Units
): EChartsCoreOption {
	const series = points.map((point) => [Date.parse(point.time), point.heightM] as [number, number]);
	const extremes = points
		.filter((point) => point.highLow !== null)
		.map((point) => ({
			coord: [Date.parse(point.time), point.heightM] as [number, number],
			itemStyle: { color: point.highLow === 'high' ? HIGH_COLOR : LOW_COLOR }
		}));

	return {
		animation: false,
		grid: { left: 8, right: 12, top: 12, bottom: 4, containLabel: true },
		tooltip: {
			trigger: 'axis',
			backgroundColor: withAlpha(DATA_COLORS.chartSurface, 0.94),
			borderColor: withAlpha(DATA_COLORS.cyan, 0.35),
			borderWidth: 1,
			textStyle: { color: DATA_COLORS.chartText, fontSize: 11 },
			formatter: (params: unknown): string => {
				const first = (Array.isArray(params) ? params[0] : params) as
					{ value?: unknown } | undefined;
				const value = Array.isArray(first?.value) ? first.value : undefined;
				if (!value) return '';
				const [time, height] = value as [number, number];
				const iso = new Date(time).toISOString();
				const match = points.find((point) => Date.parse(point.time) === time);
				const label =
					match?.highLow === 'high' ? 'High tide' : match?.highLow === 'low' ? 'Low tide' : 'Tide';
				return `${label} · ${formatFullDate(iso)} ${formatClockTime(iso)} · ${formatHeight(height, units)}`;
			}
		},
		xAxis: {
			type: 'time',
			boundaryGap: false,
			axisLine: { lineStyle: { color: AXIS_COLOR } },
			axisTick: { show: false },
			axisLabel: {
				color: LABEL_COLOR,
				fontSize: 10,
				hideOverlap: true,
				formatter: (value: number) => formatDayLabel(new Date(value).toISOString())
			}
		},
		yAxis: {
			type: 'value',
			scale: true,
			name: units === 'imperial' ? 'ft' : 'm',
			nameTextStyle: { color: LABEL_COLOR, fontSize: 10 },
			splitLine: { lineStyle: { color: withAlpha(DATA_COLORS.chartText, 0.08) } },
			axisLabel: { color: LABEL_COLOR, fontSize: 10 }
		},
		series: [
			{
				type: 'line',
				data: series,
				showSymbol: false,
				smooth: 0.35,
				lineStyle: { width: 2, color: LINE_COLOR },
				areaStyle: { color: withAlpha(DATA_COLORS.cyan, 0.18) },
				markPoint: {
					symbol: 'circle',
					symbolSize: 6,
					label: { show: false },
					data: extremes
				}
			}
		]
	} as EChartsCoreOption;
}
