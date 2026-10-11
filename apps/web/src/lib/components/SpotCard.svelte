<script lang="ts">
	/**
	 * `SpotCard.svelte` — one dashboard row: the at-a-glance conditions an
	 * experienced surfer or diver scans for (`docs/frontend.md`). Rendered on the
	 * server from the `/api/spots` snapshot.
	 */
	import { onMount, type Component } from 'svelte';
	import {
		NO_VALUE,
		formatHeight,
		formatRelativeTime,
		formatSpeed,
		formatSwell,
		formatTemperature,
		ordinalDirection,
		regionLabel,
		titleCase,
		tideStateArrow,
		type Units
	} from '../format';
	import type { ClarityRating } from '../derive';
	import type { SpotOverview, TidePreviewPoint } from '../providers/overview';
	import { favorites } from '../stores/favorites.svelte';
	import { preferences } from '../stores/preferences.svelte';

	interface Props {
		spot: SpotOverview;
		/** Fixed clock from the loader, so SSR and hydration agree. */
		now: number;
	}

	let { spot, now }: Props = $props();

	// ECharts is heavy; the tide sparkline is decorative, so it is code-split and
	// mounted after hydration rather than shipped in the dashboard's initial JS.
	let TideSparkline = $state<Component<{ points: TidePreviewPoint[]; units: Units }> | null>(null);
	onMount(async () => {
		const module = await import('./TideSparkline.svelte');
		TideSparkline = module.default;
	});

	const units = $derived<Units>(preferences.units);
	const favorite = $derived(favorites.has(spot.id));

	const nextTide = $derived(
		(spot.tide?.preview ?? []).find(
			(point) => point.highLow !== null && Date.parse(point.time) > now
		) ?? null
	);
	const nextTideLabel = $derived(
		nextTide
			? `${nextTide.highLow === 'high' ? 'High' : 'Low'} ${formatHeight(nextTide.heightM, units)} · ${formatRelativeTime(nextTide.time, now)}`
			: NO_VALUE
	);

	const RATING_BADGE: Record<ClarityRating, string> = {
		excellent: 'bg-cyan-400/15 text-cyan-100',
		good: 'bg-sky-400/15 text-sky-100',
		fair: 'bg-slate-400/20 text-slate-100',
		poor: 'bg-amber-400/15 text-amber-100'
	};
	const RATING_DOT: Record<ClarityRating, string> = {
		excellent: 'bg-cyan-300',
		good: 'bg-sky-300',
		fair: 'bg-slate-300',
		poor: 'bg-amber-300'
	};
</script>

<article
	class="flex flex-col gap-3 rounded-xl border border-sea/25 bg-deep/40 p-4 transition hover:border-surf/50 hover:bg-deep/60"
>
	<header class="flex items-start justify-between gap-2">
		<div class="min-w-0">
			<h3 class="truncate text-base font-semibold text-foam">{spot.name}</h3>
			<p class="mt-0.5 flex items-center gap-2 text-xs text-foam/50">
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
			class="-m-1 rounded-md p-1 text-lg leading-none transition hover:text-amber-200 {favorite
				? 'text-amber-300'
				: 'text-foam/35'}"
			aria-pressed={favorite}
			aria-label={favorite ? `Remove ${spot.name} from favorites` : `Add ${spot.name} to favorites`}
			onclick={() => favorites.toggle(spot.id)}
		>
			{favorite ? '★' : '☆'}
		</button>
	</header>

	<p class="text-2xl font-semibold tracking-tight text-surf">
		{formatSwell(
			spot.snapshot.waveHeightM,
			spot.snapshot.wavePeriodS,
			spot.snapshot.waveDirDeg,
			units
		)}
	</p>

	<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foam/70">
		<span>{formatTemperature(spot.snapshot.waterTempC, units)}</span>
		{#if spot.snapshot.tideState}
			<span>{tideStateArrow(spot.snapshot.tideState)} {titleCase(spot.snapshot.tideState)}</span>
		{/if}
		{#if spot.snapshot.windSpeedMs !== null}
			<span>
				{formatSpeed(spot.snapshot.windSpeedMs, units)}
				{#if spot.snapshot.windDirDeg !== null}
					{ordinalDirection(spot.snapshot.windDirDeg)}
				{/if}
			</span>
		{/if}
		{#if spot.snapshot.clarityRating}
			<span
				class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium {RATING_BADGE[
					spot.snapshot.clarityRating
				]}"
			>
				<span class="h-1.5 w-1.5 rounded-full {RATING_DOT[spot.snapshot.clarityRating]}"></span>
				{titleCase(spot.snapshot.clarityRating)} visibility
			</span>
		{/if}
	</div>

	{#if spot.tide && spot.tide.preview.length > 0}
		<div class="min-h-14">
			{#if TideSparkline}
				<TideSparkline points={spot.tide.preview} {units} />
			{/if}
			<p class="mt-1 text-[11px] text-foam/50">Next tide: {nextTideLabel}</p>
		</div>
	{:else}
		<p class="text-[11px] text-foam/40">No tide data</p>
	{/if}

	<p class="text-[11px] text-foam/40">
		{#if spot.observedAt}
			Updated {formatRelativeTime(spot.observedAt, now)}
		{:else}
			No recent observations
		{/if}
	</p>
</article>
