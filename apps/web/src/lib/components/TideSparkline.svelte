<script lang="ts">
	/**
	 * `TideSparkline.svelte` — the compact card tide preview, built on the shared
	 * `Chart` wrapper. Decorative: the card also states the tide trend and next
	 * event in text, so nothing here is the sole carrier of a value.
	 */
	import { buildTideSparklineOption } from '../charts/tide';
	import type { Units } from '../format';
	import type { TidePreviewPoint } from '../providers/overview';
	import Chart from './Chart.svelte';

	interface Props {
		points: TidePreviewPoint[];
		units: Units;
	}

	let { points, units }: Props = $props();

	const option = $derived(buildTideSparklineOption(points, units));
</script>

<Chart {option} height={56} label="Next 24 hours of tide height" />
