<script lang="ts">
	/**
	 * `ProvenanceFooter.svelte` — the spot detail page's data-provenance footer.
	 * Surfers care which model run produced a number, so this lists every source
	 * behind the page with its vintage (`docs/api-contracts.md`).
	 */
	import { formatRelativeTime } from '../format';
	import { SHORT_DISCLAIMER } from '../attribution';
	import type { SourceRecord } from '../providers/types';
	import { providerLabel } from './presentation';

	interface Props {
		sources: SourceRecord[];
		/** Forecast `generatedAt`, when the forecast loaded. */
		generatedAt?: string | null;
		/** Fixed clock from the loader, so SSR and hydration agree. */
		now: number;
	}

	let { sources, generatedAt = null, now }: Props = $props();
</script>

<footer class="rounded-xl border border-sea/20 bg-abyss/50 p-4 text-[11px] text-foam/45">
	<h2 class="text-xs font-semibold tracking-wide text-foam/50 uppercase">Data sources</h2>
	{#if generatedAt}
		<p class="mt-1">Forecast generated {formatRelativeTime(generatedAt, now)}.</p>
	{/if}
	<ul class="mt-2 flex flex-col gap-1">
		{#each sources as source (source.provider)}
			<li class="flex flex-wrap gap-x-2">
				<span class="text-foam/60">{providerLabel(source.provider)}</span>
				<span>updated {formatRelativeTime(source.asOf, now)}</span>
				{#if source.modelRun}
					<span>· model run {formatRelativeTime(source.modelRun, now)}</span>
				{/if}
				{#if source.stale}
					<span class="text-amber-200">· stale</span>
				{/if}
			</li>
		{/each}
	</ul>
	<p class="mt-3">{SHORT_DISCLAIMER}</p>
</footer>
