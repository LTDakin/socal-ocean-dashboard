<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import SpotCard from '../lib/components/SpotCard.svelte';
	import { formatRelativeTime, regionLabel } from '../lib/format';
	import { compareSpotsByInfo, type SpotOverview } from '../lib/providers/overview';
	import type { SpotType } from '../lib/spots';
	import { favorites } from '../lib/stores/favorites.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** The two use cases have different decision data, so they get separate views. */
	const activities: { id: SpotType; label: string }[] = [
		{ id: 'surf', label: 'Surf' },
		{ id: 'dive', label: 'Dive' }
	];

	let query = $state('');
	let favoritesOnly = $state(false);
	let refreshing = $state(false);
	let activity = $state<SpotType>('surf');

	const spots = $derived(data.overview?.data.spots ?? []);

	/**
	 * Apply the text + activity + favorites filters, then pin favorites to the
	 * top and rank the rest by how much information they actually carry
	 * (`compareSpotsByInfo`) so data-rich spots lead and sparse ones trail.
	 */
	function visible(list: SpotOverview[]): SpotOverview[] {
		const needle = query.trim().toLowerCase();
		return list
			.filter((spot) => {
				if (!spot.types.includes(activity)) return false;
				if (favoritesOnly && !favorites.has(spot.id)) return false;
				if (!needle) return true;
				return `${spot.name} ${regionLabel(spot.region)}`.toLowerCase().includes(needle);
			})
			.sort(
				(a, b) =>
					Number(favorites.has(b.id)) - Number(favorites.has(a.id)) || compareSpotsByInfo(a, b)
			);
	}

	// A spot that does both surf and dive appears under each activity, but the
	// toggle shows one activity at a time so it is only ever listed once.
	const activitySpots = $derived(visible(spots));
	const empty = $derived(activitySpots.length === 0);

	async function refresh(): Promise<void> {
		refreshing = true;
		try {
			await invalidateAll();
		} finally {
			refreshing = false;
		}
	}

	const control =
		'rounded-md border border-sea/40 bg-deep/40 px-3 py-1.5 text-sm text-foam/80 transition hover:border-surf/50 hover:text-foam disabled:opacity-50';
</script>

<svelte:head>
	<title>Southern California ocean conditions</title>
	<meta
		name="description"
		content="Current and forecast wave, tide, water temperature, and visibility conditions for Southern California surf and dive spots."
	/>
</svelte:head>

<div class="flex flex-col gap-6">
	<section class="flex flex-col gap-3">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<h1 class="text-2xl font-semibold tracking-tight text-foam">
					Southern California conditions
				</h1>
				<p class="mt-1 text-sm text-foam/60">
					Live wave, water, tide, and visibility for the best surf and dive spots.
					{#if data.overview?.asOf}
						Updated {formatRelativeTime(data.overview.asOf, data.now)}.
					{/if}
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<div
					class="inline-flex overflow-hidden rounded-md border border-sea/40"
					role="group"
					aria-label="Show conditions for"
				>
					{#each activities as option (option.id)}
						<button
							type="button"
							class="px-3 py-1.5 text-sm transition {activity === option.id
								? 'bg-surf/25 text-foam'
								: 'text-foam/60 hover:bg-sea/15 hover:text-foam'}"
							aria-pressed={activity === option.id}
							onclick={() => (activity = option.id)}
						>
							{option.label}
						</button>
					{/each}
				</div>
				<input
					bind:value={query}
					type="search"
					placeholder="Filter spots…"
					aria-label="Filter spots by name or region"
					class="{control} w-40 placeholder:text-foam/40"
				/>
				<button
					type="button"
					class="{control} {favoritesOnly ? 'border-amber-300/60 text-amber-200' : ''}"
					aria-pressed={favoritesOnly}
					onclick={() => (favoritesOnly = !favoritesOnly)}
				>
					★ Favorites
				</button>
				<button type="button" class={control} disabled={refreshing} onclick={refresh}>
					{refreshing ? 'Refreshing…' : 'Refresh'}
				</button>
			</div>
		</div>

		{#if data.overview?.stale}
			<p
				class="rounded-md border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
			>
				Some conditions are stale — showing the last good values while the upstream recovers.
			</p>
		{/if}
	</section>

	{#if data.error}
		<section
			class="rounded-xl border border-sea/30 bg-deep/40 p-6 text-center text-sm text-foam/70"
		>
			<p class="font-medium text-foam">Conditions unavailable</p>
			<p class="mt-1">{data.error}</p>
			<button type="button" class="{control} mt-3" disabled={refreshing} onclick={refresh}>
				Try again
			</button>
		</section>
	{:else if spots.length === 0}
		<section
			class="rounded-xl border border-sea/30 bg-deep/40 p-6 text-center text-sm text-foam/60"
		>
			No spots are configured yet.
		</section>
	{:else if empty}
		<section
			class="rounded-xl border border-sea/30 bg-deep/40 p-6 text-center text-sm text-foam/60"
		>
			No spots match your filters.
		</section>
	{:else}
		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-semibold tracking-wide text-foam/50 uppercase">
				{activity === 'surf' ? 'Surf spots' : 'Dive spots'}
			</h2>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each activitySpots as spot (spot.id)}
					<SpotCard {spot} now={data.now} />
				{/each}
			</div>
		</section>
	{/if}
</div>
