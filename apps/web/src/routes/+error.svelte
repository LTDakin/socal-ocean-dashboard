<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>Error — So-cal Ocean Dashboard</title>
</svelte:head>

<div class="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
	<p class="text-4xl font-semibold text-surf">{page.status}</p>
	<p class="text-sm text-foam/70">{page.error?.message ?? 'Something went wrong.'}</p>
	<a
		href={resolve('/')}
		class="rounded-md border border-sea/40 px-3 py-1.5 text-sm text-foam/80 transition hover:border-surf/50 hover:text-foam"
	>
		Back to the dashboard
	</a>
</div>
