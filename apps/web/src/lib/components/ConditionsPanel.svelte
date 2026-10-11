<script lang="ts">
	/**
	 * `ConditionsPanel.svelte` — the "now" snapshot on the spot detail page,
	 * with per-field provenance from `/current` (`docs/api-contracts.md`). Each
	 * value carries the station it came from and how old it is, so a buoy that is
	 * lagging reads as lagging rather than as a fresh number.
	 */
	import {
		NO_VALUE,
		formatRelativeTime,
		formatSpeed,
		formatSwell,
		formatTemperature,
		formatWaterLevel,
		ordinalDirection,
		tideStateArrow,
		titleCase,
		type Units
	} from '../format';
	import type { CurrentConditions, CurrentField, FieldProvenance } from '../providers/current';
	import { providerLabel } from './presentation';

	interface Props {
		current: CurrentConditions | null;
		/** Fixed clock from the loader, so SSR and hydration agree. */
		now: number;
		units: Units;
	}

	let { current, now, units }: Props = $props();

	/** The newest provenance across a metric's contributing fields. */
	function provenance(fields: readonly CurrentField[]): string | null {
		if (!current) return null;
		let newest: FieldProvenance | null = null;
		for (const field of fields) {
			const record = current.fields[field];
			if (!record) continue;
			if (!newest || record.observedAt > newest.observedAt) newest = record;
		}
		if (!newest) return null;
		return `${providerLabel(newest.provider)} ${newest.stationId} · ${formatRelativeTime(newest.observedAt, now)}`;
	}

	const metrics = $derived(
		current
			? [
					{
						label: 'Waves',
						value: formatSwell(current.waveHeightM, current.wavePeriodS, current.waveDirDeg, units),
						source: provenance(['waveHeightM', 'wavePeriodS', 'waveDirDeg'])
					},
					{
						label: 'Water temp',
						value: formatTemperature(current.waterTempC, units),
						source: provenance(['waterTempC'])
					},
					{
						label: 'Wind',
						value:
							current.windSpeedMs !== null
								? `${formatSpeed(current.windSpeedMs, units)}${
										current.windDirDeg !== null ? ` ${ordinalDirection(current.windDirDeg)}` : ''
									}`
								: NO_VALUE,
						source: provenance(['windSpeedMs', 'windDirDeg'])
					},
					{
						label: 'Water level',
						value:
							current.waterLevelM !== null
								? `${formatWaterLevel(current.waterLevelM, units)}${
										current.tideState
											? ` ${tideStateArrow(current.tideState)} ${titleCase(current.tideState)}`
											: ''
									}`
								: NO_VALUE,
						source: provenance(['waterLevelM', 'tideState'])
					}
				]
			: []
	);
</script>

<section class="rounded-xl border border-sea/25 bg-deep/40 p-4">
	<header class="flex flex-wrap items-baseline">
		{#if current?.observedAt}
		    <h2 class="text-sm font-semibold tracking-wide text-foam/50 uppercase">Observed {formatRelativeTime(current.observedAt, now)}</h2>
		{/if}
	</header>

	{#if current && metrics.length > 0}
		<dl class="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
			{#each metrics as metric (metric.label)}
				<div>
					<dt class="text-xs tracking-wide text-foam/50 uppercase">{metric.label}</dt>
					<dd class="mt-1 text-lg font-semibold text-foam">{metric.value}</dd>
					{#if metric.source}
						<p class="mt-0.5 text-[11px] text-foam/40" title={metric.source}>{metric.source}</p>
					{/if}
				</div>
			{/each}
		</dl>
	{:else}
		<p class="mt-3 text-sm text-foam/50">
			No real-time observation is available right now. The forecast below still covers the window.
		</p>
	{/if}
</section>
