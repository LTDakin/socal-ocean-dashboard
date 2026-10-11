<script lang="ts">
	/**
	 * `ConditionsPanel.svelte` — the "now" snapshot on the spot detail page,
	 * with per-field provenance from `/current` (`docs/api-contracts.md`). Each
	 * value carries the station it came from and how old it is, so a buoy that is
	 * lagging reads as lagging rather than as a fresh number.
	 *
	 * Each metric also gets a low→high range meter (`RangeMeter.svelte`) plus a
	 * qualitative band, so a bare number reads as "kinda high swell" / "low wind"
	 * without the reader knowing the units (`docs/plan-now-condition-scales.md`).
	 */
	import {
		NO_VALUE,
		formatHeight,
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
	import RangeMeter from './RangeMeter.svelte';
	import { providerLabel } from './presentation';
	import {
		SCALE_BOUNDS,
		SCALE_THEMES,
		scalePosition,
		waterLevelBand,
		waterTempBand,
		wavesBand,
		windBand,
		type ScaleKey
	} from './scales';

	interface Props {
		current: CurrentConditions | null;
		/** Fixed clock from the loader, so SSR and hydration agree. */
		now: number;
		units: Units;
	}

	let { current, now, units }: Props = $props();

	/** The range-meter payload for one metric. */
	interface Meter {
		position: number;
		accent: string;
		track: string;
		lowLabel: string;
		highLabel: string;
		band: string;
		label: string;
	}

	/**
	 * Build a meter for a metric, or `null` when the value is missing (the panel
	 * then shows `—` and no scale). `band` and `format` read the metric in its own
	 * terms (ft, mph, °F …) so the labels match the number above them.
	 */
	function buildMeter(
		key: ScaleKey,
		value: number | null,
		band: (value: number) => string,
		format: (value: number) => string,
		caption: string
	): Meter | null {
		if (value === null || !Number.isFinite(value)) return null;
		const bounds = SCALE_BOUNDS[key];
		const theme = SCALE_THEMES[key];
		const reading = band(value);
		return {
			position: scalePosition(value, key),
			accent: theme.accent,
			track: theme.track,
			lowLabel: format(bounds.min),
			highLabel: format(bounds.max),
			band: reading,
			label: `${caption}: ${reading} (${format(value)}) on a scale from ${format(
				bounds.min
			)} to ${format(bounds.max)}`
		};
	}

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
						meter: buildMeter(
							'waves',
							current.waveHeightM,
							wavesBand,
							(value) => formatHeight(value, units),
							'Swell height'
						),
						source: provenance(['waveHeightM', 'wavePeriodS', 'waveDirDeg'])
					},
					{
						label: 'Water temp',
						value: formatTemperature(current.waterTempC, units),
						meter: buildMeter(
							'waterTemp',
							current.waterTempC,
							waterTempBand,
							(value) => formatTemperature(value, units),
							'Water temperature'
						),
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
						meter: buildMeter(
							'wind',
							current.windSpeedMs,
							windBand,
							(value) => formatSpeed(value, units),
							'Wind speed'
						),
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
						meter: buildMeter(
							'waterLevel',
							current.waterLevelM,
							waterLevelBand,
							(value) => formatWaterLevel(value, units),
							'Water level'
						),
						source: provenance(['waterLevelM', 'tideState'])
					}
				]
			: []
	);
</script>

<section class="rounded-xl border border-sea/25 bg-deep/40 p-4">
	<header class="flex flex-wrap items-baseline">
		{#if current?.observedAt}
			<h2 class="text-sm font-semibold tracking-wide text-foam/50 uppercase">
				Observed {formatRelativeTime(current.observedAt, now)}
			</h2>
		{/if}
	</header>

	{#if current && metrics.length > 0}
		<dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
			{#each metrics as metric (metric.label)}
				<div>
					<dt class="text-xs tracking-wide text-foam/50 uppercase">{metric.label}</dt>
					<dd class="mt-1 text-lg font-semibold text-foam">
						{metric.value}
						{#if metric.meter}
							<span
								class="ml-1 align-middle text-xs font-medium"
								style={`color:${metric.meter.accent}`}
							>
								{metric.meter.band}
							</span>
						{/if}
					</dd>
					{#if metric.meter}
						<RangeMeter
							position={metric.meter.position}
							accent={metric.meter.accent}
							track={metric.meter.track}
							lowLabel={metric.meter.lowLabel}
							highLabel={metric.meter.highLabel}
							label={metric.meter.label}
						/>
					{/if}
					{#if metric.source}
						<p class="mt-1 text-[11px] text-foam/40" title={metric.source}>{metric.source}</p>
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
