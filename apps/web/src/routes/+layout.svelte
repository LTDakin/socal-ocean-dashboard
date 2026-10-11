<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { SHORT_DISCLAIMER, sourceNames } from '../lib/attribution';
	import { favorites } from '../lib/stores/favorites.svelte';
	import { preferences } from '../lib/stores/preferences.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// SSR renders the seed defaults; adopt the stored preferences after mount so
	// the first paint matches the server markup (no hydration mismatch).
	onMount(() => {
		favorites.hydrate();
		preferences.hydrate();
	});

	const navLink = 'rounded-md px-3 py-1.5 text-foam/70 transition hover:bg-sea/20 hover:text-foam';
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex min-h-dvh flex-col">
	<header class="sticky top-0 z-20 border-b border-sea/30 bg-abyss/85 backdrop-blur">
		<div class="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
			<a href={resolve('/')} class="text-foam" aria-label="So-cal Ocean Dashboard home">
				<span class="text-lg font-semibold tracking-tight">So-cal Ocean</span>
				<span class="ml-2 hidden text-xs text-foam/50 sm:inline">Surf &amp; dive conditions</span>
			</a>
			<nav class="flex items-center gap-1 text-sm">
				<a href={resolve('/')} class={navLink}>Dashboard</a>
				<button
					type="button"
					class={navLink}
					aria-label={`Show values in ${preferences.units === 'imperial' ? 'metric' : 'imperial'} units`}
					onclick={() => preferences.toggle()}
				>
					{preferences.units === 'imperial' ? 'ft · °F' : 'm · °C'}
				</button>
				<a href={resolve('/about')} class={navLink}>About</a>
			</nav>
		</div>
	</header>

	<main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
		{@render children()}
	</main>

	<footer class="border-t border-sea/30 bg-abyss/85">
		<div class="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-foam/45">
			<p>Data: {sourceNames()}.</p>
			<p>
				{SHORT_DISCLAIMER}
				<a
					href={resolve('/about')}
					class="text-foam/60 underline-offset-2 transition hover:text-foam hover:underline"
				>
					Sources &amp; methodology →
				</a>
			</p>
		</div>
	</footer>
</div>
