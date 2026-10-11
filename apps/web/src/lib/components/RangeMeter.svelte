<script lang="ts">
	/**
	 * `RangeMeter.svelte` — a CSS-only low→high scale with a marker at the
	 * current value, used by the "now" panel (`ConditionsPanel.svelte`).
	 *
	 * Deliberately not ECharts: this is a glance, not a chart, so it never pulls
	 * the chart bundle onto the detail page (same call as `SurfScoreStrip`). The
	 * number and the end labels stay visible, so color is never the only encoding
	 * (`docs/frontend.md` → accessibility).
	 */
	interface Props {
		/** Current value's place on the scale: 0 (low) → 1 (high). */
		position: number;
		/** Marker fill (the metric's accent color). */
		accent: string;
		/** Track background: a CSS gradient from low to high. */
		track: string;
		lowLabel: string;
		highLabel: string;
		/** Accessible summary of the value and its position. */
		label: string;
	}

	let { position, accent, track, lowLabel, highLabel, label }: Props = $props();

	const pct = $derived(Math.min(100, Math.max(0, position * 100)));
</script>

<div class="mt-2" title={label} aria-label={label}>
	<div class="relative px-[7px]">
		<div class="h-2 w-full rounded-full" style={`background:${track}`}></div>
		<span
			class="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-abyss shadow"
			style={`left:calc(7px + (100% - 14px) * ${pct / 100});background:${accent}`}
		></span>
	</div>
	<div class="mt-1 flex justify-between text-[10px] text-foam/40">
		<span>{lowLabel}</span>
		<span>{highLabel}</span>
	</div>
</div>
