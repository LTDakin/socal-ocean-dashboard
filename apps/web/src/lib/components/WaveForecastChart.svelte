<script lang="ts">
	/**
	 * `WaveForecastChart.svelte` — the 14-day wave/swell chart for the spot
	 * detail page. A thin shell over `Chart.svelte`; the option lives in
	 * `lib/charts/wave.ts` so it stays testable.
	 */
	import { buildWaveForecastOption } from '../charts/wave';
	import type { Units } from '../format';
	import type { DailyWaveForecast } from '../providers/gfswave';
	import Chart from './Chart.svelte';

	interface Props {
		daily: DailyWaveForecast[];
		units: Units;
	}

	let { daily, units }: Props = $props();

	const option = $derived(buildWaveForecastOption(daily, units));
</script>

<Chart {option} height={240} label="Daily significant wave and swell height with period" />
