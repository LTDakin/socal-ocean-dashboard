/**
 * `lib/charts/echarts.ts` — the single ECharts entry point.
 *
 * Only the chart types and components the app actually uses are registered, so
 * the bundle stays tree-shaken; every chart component goes through the shared
 * `Chart.svelte` wrapper rather than calling `init` itself (`docs/frontend.md`).
 */
import { BarChart, LineChart } from 'echarts/charts';
import {
	GridComponent,
	LegendComponent,
	MarkLineComponent,
	MarkPointComponent,
	TooltipComponent
} from 'echarts/components';
import { init, use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption, EChartsType } from 'echarts/core';

use([
	LineChart,
	BarChart,
	GridComponent,
	TooltipComponent,
	LegendComponent,
	MarkPointComponent,
	MarkLineComponent,
	CanvasRenderer
]);

export type { EChartsCoreOption, EChartsType };

/** Create an ECharts instance bound to a sized host element. */
export function createChart(host: HTMLElement): EChartsType {
	return init(host, undefined, { renderer: 'canvas' });
}
