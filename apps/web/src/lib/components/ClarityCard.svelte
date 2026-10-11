<script lang="ts">
	/**
	 * `ClarityCard.svelte` — observed satellite water clarity on the spot detail
	 * page. There is no forecast for visibility, so this is explicitly labeled
	 * **observed, not forecast** (`docs/data-sources.md`): the VIIRS Kd490 product
	 * lags by 2-3 days and is frequently cloud-blocked.
	 */
	import { formatHeight, formatRelativeTime, titleCase, type Units } from '../format';
	import type { ClarityObservation } from '../providers/coastwatch';
	import { CLARITY_BADGE, CLARITY_DOT } from './presentation';

	interface Props {
		clarity: ClarityObservation | null;
		/** Fixed clock from the loader, so SSR and hydration agree. */
		now: number;
		units: Units;
	}

	let { clarity, now, units }: Props = $props();

	const observed = $derived(Boolean(clarity?.observedAt && clarity.rating));
</script>

<section class="flex flex-col gap-3 rounded-xl border border-sea/25 bg-deep/40 p-4">
	<header class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-sm font-semibold tracking-wide text-foam/50 uppercase">Water clarity</h2>
		<p class="text-xs text-foam/40">Observed, not forecast</p>
	</header>

	{#if clarity && observed}
		<div class="flex flex-wrap items-center gap-3">
			<span
				class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium {CLARITY_BADGE[
					clarity.rating!
				]}"
			>
				<span class="h-2 w-2 rounded-full {CLARITY_DOT[clarity.rating!]}"></span>
				{titleCase(clarity.rating)}
			</span>
			<p class="text-lg font-semibold text-foam">
				{formatHeight(clarity.secchiDepthM, units)}
			</p>
		</div>
		<p class="text-xs text-foam/50">
			Secchi depth (est.) · Kd490 {clarity.kd490?.toFixed(4)} m⁻¹
		</p>
		<p class="text-[11px] text-foam/40">
			Satellite day {formatRelativeTime(clarity.observedAt, now)}
			{#if clarity.pixel}
				· {clarity.pixel.lat.toFixed(3)}, {clarity.pixel.lon.toFixed(3)}
			{/if}
		</p>
	{:else}
		<p class="text-sm text-foam/50">
			No cloud-free satellite pixel in the last 10 days. Clarity is observed, not forecast, so there
			is no fallback value.
		</p>
	{/if}
</section>
