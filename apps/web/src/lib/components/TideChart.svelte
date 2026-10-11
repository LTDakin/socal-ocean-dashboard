<script lang="ts">
	/**
	 * `TideChart.svelte` — the full tide curve for the spot detail page, built on
	 * the shared `Chart` wrapper. The option lives in `lib/charts/tide.ts`.
	 */
	import { buildTideCurveOption } from '../charts/tide';
	import type { Units } from '../format';
	import type { TidePreviewPoint } from '../providers/overview';
	import Chart from './Chart.svelte';

	interface Props {
		points: TidePreviewPoint[];
		units: Units;
	}

	let { points, units }: Props = $props();

	const option = $derived(buildTideCurveOption(points, units));
</script>

<Chart {option} height={220} label="Predicted tide height with high and low markers" />
