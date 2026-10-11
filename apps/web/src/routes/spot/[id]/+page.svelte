<script lang="ts">
	import { resolve } from '$app/paths';
	import ClarityCard from '../../../lib/components/ClarityCard.svelte';
	import ConditionsPanel from '../../../lib/components/ConditionsPanel.svelte';
	import ProvenanceFooter from '../../../lib/components/ProvenanceFooter.svelte';
	import SurfScoreStrip from '../../../lib/components/SurfScoreStrip.svelte';
	import TideChart from '../../../lib/components/TideChart.svelte';
	import WaveForecastChart from '../../../lib/components/WaveForecastChart.svelte';
	import { formatRelativeTime, regionLabel } from '../../../lib/format';
	import { favorites } from '../../../lib/stores/favorites.svelte';
	import { preferences } from '../../../lib/stores/preferences.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const spot = $derived(data.spot);
	const now = $derived(data.now);
	const units = $derived(preferences.units);
	const favorite = $derived(favorites.has(spot.id));

	const current = $derived(data.current.data?.data.current ?? null);
	const clarity = $derived(data.clarity.data?.data.clarity ?? null);
	const tidePoints = $derived(data.tidePoints);

	const section = 'rounded-xl border border-sea/25 bg-deep/40 p-4';
	const heading = 'text-sm font-semibold tracking-wide text-foam/50 uppercase';
</script>

<svelte:head>
	<title>{spot.name} — So-cal Ocean Dashboard</title>
	<meta
		name="description"
		content="Current conditions, 14-day wave forecast, tides, and water clarity for {spot.name}, {regionLabel(
			spot.region
		)}."
	/>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<a href={resolve('/')} class="text-xs text-foam/50 transition hover:text-foam">← All spots</a>
		<div class="mt-2 flex items-start justify-between gap-3">
			<div class="min-w-0">
				<h1 class="truncate text-2xl font-semibold tracking-tight text-foam">{spot.name}</h1>
				<p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-foam/50">
					<span>{regionLabel(spot.region)}</span>
					{#each spot.types as type (type)}
						<span class="rounded bg-sea/25 px-1.5 py-0.5 text-[10px] tracking-wide uppercase">
							{type}
						</span>
					{/each}
				</p>
			</div>
			<button
				type="button"
				class="rounded-md border border-sea/40 px-3 py-1.5 text-sm transition hover:border-amber-300/60"
				aria-pressed={favorite}
				onclick={() => favorites.toggle(spot.id)}
			>
				{favorite ? '★ Favorited' : '☆ Favorite'}
			</button>
		</div>
	</div>

	{#await data.provenance then provenance}
		{#if provenance.stale}
			<p
				class="rounded-md border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
			>
				Some conditions are stale — showing the last good values while the upstream recovers.
			</p>
		{/if}
	{/await}

	<ConditionsPanel {current} {now} {units} />

	<ClarityCard {clarity} {now} {units} />

	{#await data.forecast}
		<section class={section}>
			<h2 class={heading}>Surf score</h2>
			<p class="mt-2 text-sm text-foam/50">Loading forecast…</p>
		</section>
	{:then forecast}
		{@const gfswave = forecast.data?.data.gfswave ?? null}
		{#if gfswave}
			<SurfScoreStrip daily={gfswave.daily} {now} />
		{:else}
			<section class={section}>
				<h2 class={heading}>Surf score</h2>
				<p class="mt-2 text-sm text-foam/50">
					No surf score available{forecast.error ? ` (${forecast.error})` : ''}.
				</p>
			</section>
		{/if}
	{/await}

	<section class={section}>
		<header class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 class={heading}>Wave &amp; swell forecast</h2>
			{#await data.forecast then forecast}
				{#if forecast.data?.data.gfswave}
					<p class="text-xs text-foam/40">
						Model run {formatRelativeTime(forecast.data.data.gfswave.modelRun, now)}
					</p>
				{/if}
			{/await}
		</header>
		{#await data.forecast}
			<p class="mt-3 text-sm text-foam/50">Loading forecast…</p>
		{:then forecast}
			{@const gfswave = forecast.data?.data.gfswave ?? null}
			{#if gfswave && gfswave.daily.length > 0}
				<div class="mt-3">
					<WaveForecastChart daily={gfswave.daily} {units} />
				</div>
				<p class="mt-2 text-[11px] text-foam/40">
					Daily maxima at the spot's offshore model point. Bar heights: significant wave &amp; swell
					height; line: dominant period.
				</p>
			{:else}
				<p class="mt-3 text-sm text-foam/50">
					Forecast unavailable{forecast.error ? ` (${forecast.error})` : ''}.
				</p>
			{/if}
		{/await}
	</section>

	<section class={section}>
		<header class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 class={heading}>Tides</h2>
			<p class="text-xs text-foam/40">MLLW predictions</p>
		</header>
		{#if tidePoints.length > 0}
			<div class="mt-3">
				<TideChart points={tidePoints} {units} />
			</div>
			<p class="mt-2 text-[11px] text-foam/40">
				Astronomical predictions{data.tides.data?.data.coops
					? ` · station ${data.tides.data.data.coops.stationId}`
					: ''}. Dots mark high/low events.
			</p>
		{:else}
			<p class="mt-3 text-sm text-foam/50">
				Tide predictions unavailable{data.tides.error ? ` (${data.tides.error})` : ''}.
			</p>
		{/if}
	</section>

	{#await data.provenance then provenance}
		<ProvenanceFooter sources={provenance.sources} generatedAt={provenance.generatedAt} {now} />
	{/await}
</div>
