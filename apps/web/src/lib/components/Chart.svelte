<script lang="ts">
	/**
	 * `Chart.svelte` — the one shared ECharts wrapper (`docs/frontend.md`).
	 *
	 * Owns the instance lifecycle: init on mount, resize with the container,
	 * re-apply the option when it changes, dispose on destroy. Consumers pass a
	 * plain ECharts option and never touch `echarts` directly.
	 */
	import { onMount } from 'svelte';
	import { createChart, type EChartsCoreOption, type EChartsType } from '../charts/echarts';

	interface Props {
		option: EChartsCoreOption;
		/** Host height in px. */
		height?: number;
		/** Accessible description; charts are never the only source of a value. */
		label?: string;
	}

	let { option, height = 160, label }: Props = $props();

	let host = $state<HTMLDivElement | null>(null);
	let chart: EChartsType | null = null;

	onMount(() => {
		if (!host) return;
		chart = createChart(host);
		chart.setOption(option);

		const observer = new ResizeObserver(() => chart?.resize());
		observer.observe(host);

		return () => {
			observer.disconnect();
			chart?.dispose();
			chart = null;
		};
	});

	$effect(() => {
		// Re-read `option` so a changed prop re-applies without a full remount.
		const next = option;
		if (chart) chart.setOption(next, { notMerge: true });
	});
</script>

<div bind:this={host} role="img" aria-label={label} style={`height:${height}px;width:100%`}></div>
