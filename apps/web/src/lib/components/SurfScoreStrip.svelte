<script lang="ts">
	/**
	 * `SurfScoreStrip.svelte` — the per-day surf score (0-10) on the spot detail
	 * page (`docs/frontend.md`). The score is experimental; the strip shows the
	 * value and the day's best window in a tooltip. Deliberately CSS-only: it is a
	 * compact glance, not a chart, so it does not pull ECharts onto the page.
	 *
	 * Color is a lightness ramp within one hue (colorblind-safe), and the number
	 * is always shown, so color is never the only encoding.
	 */
	import { formatClockTime, formatDayLabel, formatFullDate, NO_VALUE } from '../format';
	import type { DailyWaveForecast } from '../providers/gfswave';

	interface Props {
		daily: DailyWaveForecast[];
		/** Fixed clock from the loader, so SSR and hydration agree. */
		now: number;
	}

	let { daily, now }: Props = $props();

	const todayKey = $derived(new Date(now).toISOString().slice(0, 10));

	function barClass(score: number | null): string {
		if (score === null) return 'bg-transparent';
		if (score >= 7) return 'bg-cyan-300';
		if (score >= 4) return 'bg-surf';
		return 'bg-sea';
	}

	function tooltip(day: DailyWaveForecast): string {
		const head = formatFullDate(day.date);
		if (day.surfScore === null) return `${head} · no score`;
		const window = day.bestTimeWindow ? ` at ${formatClockTime(day.bestTimeWindow)}` : '';
		return `${head} · best ${day.surfScore.toFixed(1)}/10${window}`;
	}
</script>

<section class="rounded-xl border border-sea/25 bg-deep/40 p-4">
	<header class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-sm font-semibold tracking-wide text-foam/50 uppercase">Surf forecast</h2>
		<p class="text-xs text-foam/40">Experimental · best hour each day</p>
	</header>

	{#if daily.length > 0}
		<div class="mt-3 flex gap-1 overflow-x-auto pb-1">
			{#each daily as day (day.date)}
				<div
					class="flex min-w-9 flex-1 flex-col items-center gap-1"
					title={tooltip(day)}
					aria-label={tooltip(day)}
				>
					<span class="text-[10px] {day.date === todayKey ? 'text-surf' : 'text-foam/50'}">
						{formatDayLabel(day.date)}
					</span>
					<div class="flex h-20 w-full items-end overflow-hidden rounded-md bg-sea/15">
						<div
							class="w-full rounded-t-md {barClass(day.surfScore)}"
							style={`height:${day.surfScore === null ? 0 : (day.surfScore / 10) * 100}%`}
						></div>
					</div>
					<span class="text-[11px] font-medium text-foam">
						{day.surfScore === null ? NO_VALUE : day.surfScore.toFixed(1)}
					</span>
				</div>
			{/each}
		</div>
	{:else}
		<p class="mt-3 text-sm text-foam/50">No surf score for this window.</p>
	{/if}
</section>
