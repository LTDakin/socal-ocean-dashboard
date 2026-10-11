/**
 * `lib/charts/tide.ts` — ECharts option for the compact card tide preview.
 *
 * Kept as a pure function so the chart shape is testable and the component stays
 * a thin shell around `Chart.svelte`.
 */
import type { EChartsCoreOption } from 'echarts/core';
import { formatHeight, formatRelativeTime, type Units } from '../format';
import type { TidePreviewPoint } from '../providers/overview';

const LINE_COLOR = '#4fb3d9';
const HIGH_COLOR = '#e6f4fa';
const LOW_COLOR = '#7fb3c9';

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
			backgroundColor: 'rgba(4, 18, 31, 0.94)',
			borderColor: 'rgba(79, 179, 217, 0.35)',
			borderWidth: 1,
			textStyle: { color: '#e6f4fa', fontSize: 11 },
			formatter: (params: unknown): string => {
				const first = (Array.isArray(params) ? params[0] : params) as
					{ value?: unknown } | undefined;
				const value = Array.isArray(first?.value) ? first.value : undefined;
				if (!value) return '';
				const [time, height] = value as [number, number];
				return `${formatRelativeTime(new Date(time).toISOString())} · ${formatHeight(height, units)}`;
			}
		},
		series: [
			{
				type: 'line',
				data: series,
				showSymbol: false,
				smooth: 0.35,
				lineStyle: { width: 2, color: LINE_COLOR },
				areaStyle: { color: 'rgba(79, 179, 217, 0.18)' },
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
