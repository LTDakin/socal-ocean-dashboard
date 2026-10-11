<script lang="ts">
	const appName = 'So-cal Ocean Dashboard';
</script>

<svelte:head>
	<title>{appName}</title>
	<meta
		name="description"
		content="Real-time and forecast ocean conditions for Southern California."
	/>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 p-8">
	<h1 class="text-3xl font-semibold text-surf">{appName}</h1>
	<p class="text-foam/70">
		Scaffold is up. The curated spot list and live conditions land in later milestones.
	</p>
	<p class="text-sm text-foam/40">Status: M0 — tooling &amp; scaffold</p>
</main>
