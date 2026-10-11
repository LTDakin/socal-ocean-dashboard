<script lang="ts">
	import { DATA_SOURCES, SAFETY_DISCLAIMER, SOFTWARE } from '../../lib/attribution';
	import { CLARITY_DOT } from '../../lib/components/presentation';
	import {
		CLARITY_BANDS,
		DEFAULT_SURF_SCORE_CONFIG,
		SECCHI_KD_COEFFICIENT
	} from '../../lib/derive';

	const card = 'rounded-xl border border-sea/25 bg-deep/40 p-4';
	const heading = 'text-sm font-semibold tracking-wide text-foam/50 uppercase';
	const link = 'text-surf underline-offset-2 transition hover:text-foam hover:underline';
	const chip = 'rounded-md border border-sea/25 bg-abyss/50 px-2 py-1 font-mono text-xs';
	const arrow = 'text-foam/30';

	/** The three stages data passes through, for the flow diagram. */
	const PIPELINE = [
		{
			step: 'Upstream',
			detail: 'NOAA & Scripps public data: GFS-Wave, CDIP, NDBC, CO-OPS, VIIRS.'
		},
		{
			step: 'Our server',
			detail: 'Cached to each source’s cadence, gap-filled, then metrics derived.'
		},
		{ step: 'Your screen', detail: 'Dashboard and spot detail — SI in, your units out.' }
	];

	/** Secchi bands, ascending (poor → excellent), labelled with their range. */
	const bands = [...CLARITY_BANDS]
		.sort((a, b) => a.minSecchiM - b.minSecchiM)
		.map((band, index, all) => {
			const next = all[index + 1];
			return {
				rating: band.rating,
				label: !next
					? `≥ ${band.minSecchiM} m`
					: index === 0
						? `< ${next.minSecchiM} m`
						: `${band.minSecchiM}–${next.minSecchiM} m`
			};
		});

	const config = DEFAULT_SURF_SCORE_CONFIG;
	const weightLabels: Record<string, string> = {
		size: 'Swell size',
		period: 'Period',
		direction: 'Direction',
		wind: 'Wind',
		tide: 'Tide'
	};
	const weights = Object.entries(config.weights).map(([key, weight]) => ({
		label: weightLabels[key] ?? key,
		weight
	}));
	const maxWeight = Math.max(...weights.map((w) => w.weight));

	/** Per-component ramps from the live config, so the page can't drift. */
	const sizeSpan = (config.size.idealM - config.size.minM).toFixed(1);
	const periodSpan = (config.period.idealS - config.period.minS).toFixed(0);
	const COMPONENTS = [
		{ name: 'size', formula: `clamp((Hₛ − ${config.size.minM}) / ${sizeSpan}, 0, 1)` },
		{ name: 'period', formula: `clamp((T − ${config.period.minS}) / ${periodSpan}, 0, 1)` },
		{ name: 'direction', formula: `clamp(1 − Δ / ${config.direction.maxOffsetDeg}°, 0, 1)` }
	];

	/** Which source backs each "now" field, for the observations card. */
	const CURRENT_FIELDS = [
		{ field: 'waves', source: 'CDIP buoy → NDBC twin' },
		{ field: 'water temp', source: 'buoy, else shore sensor' },
		{ field: 'wind', source: 'newest station w/ speed + dir' },
		{ field: 'water level', source: 'CO-OPS observation' }
	];
</script>

<svelte:head>
	<title>About — So-cal Ocean Dashboard</title>
	<meta
		name="description"
		content="Where the So-cal Ocean Dashboard's data comes from, how each number is derived, and its safety limits."
	/>
</svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-6">
	<header class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold tracking-tight text-foam">About</h1>
		<p class="text-sm leading-relaxed text-foam/70">
			A Southern California surf &amp; dive conditions dashboard. Every value is built from public,
			key-free NOAA and Scripps data — no paywalls, no black boxes. This page explains what we show,
			how we derive it, and where it can mislead you.
		</p>
	</header>

	<section class="rounded-xl border border-amber-300/30 bg-amber-400/10 p-4">
		<h2 class="text-sm font-semibold tracking-wide text-amber-100 uppercase">
			Don't bet your life on it
		</h2>
		<p class="mt-2 text-sm leading-relaxed text-amber-100/90">{SAFETY_DISCLAIMER}</p>
	</section>

	<section class={card}>
		<h2 class={heading}>How data reaches you</h2>
		<div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
			{#each PIPELINE as stage, index (stage.step)}
				{#if index > 0}
					<span class="hidden self-center {arrow} sm:block" aria-hidden="true">→</span>
				{/if}
				<div class="flex-1 rounded-lg border border-sea/25 bg-abyss/40 p-3">
					<p class="text-xs font-semibold tracking-wide text-surf uppercase">{stage.step}</p>
					<p class="mt-1 text-xs leading-relaxed text-foam/60">{stage.detail}</p>
				</div>
			{/each}
		</div>
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="px-1 {heading}">How each number is made</h2>

		<div class="grid gap-4 md:grid-cols-3">
			<article class={card}>
				<h3 class="text-sm font-medium text-foam">Wave &amp; swell</h3>
				<p class="mt-2 text-xs leading-relaxed text-foam/60">
					NOAA's WAVEWATCH III global model, sampled at each spot's offshore deep-water point. The
					full ~14-day window is kept — hourly to +120&nbsp;h, then three-hourly — split into its
					wind-wave and swell partitions. A <em>deep-water</em> model: it does not resolve how a specific
					beach refracts or blocks a swell.
				</p>
				<p class="mt-2 text-[11px] text-foam/40">Source · NOAA GFS-Wave</p>
			</article>

			<article class={card}>
				<h3 class="text-sm font-medium text-foam">Current conditions</h3>
				<p class="mt-2 text-xs leading-relaxed text-foam/60">
					Real observations, not model output. Each field comes from its best available source and
					keeps its own timestamp, shown in the conditions panel.
				</p>
				<dl class="mt-2 flex flex-col gap-0.5">
					{#each CURRENT_FIELDS as item (item.field)}
						<div class="flex gap-2 text-[11px]">
							<dt class="w-20 shrink-0 text-foam/45">{item.field}</dt>
							<dd class="font-mono text-foam/70">{item.source}</dd>
						</div>
					{/each}
				</dl>
			</article>

			<article class={card}>
				<h3 class="text-sm font-medium text-foam">Tides</h3>
				<p class="mt-2 text-xs leading-relaxed text-foam/60">
					Astronomical predictions from NOAA CO-OPS for the spot's tide station, referenced to Mean
					Lower Low Water, with high and low events marked on the curve. The live tide
					<em>state</em> (rising / falling) comes from the observed water-level trend instead.
				</p>
				<p class="mt-2 text-[11px] text-foam/40">Source · NOAA CO-OPS</p>
			</article>
		</div>

		<article class={card}>
			<h3 class="text-sm font-medium text-foam">Water clarity &amp; visibility</h3>
			<p class="mt-2 text-sm leading-relaxed text-foam/70">
				There is no forecast for underwater visibility. We show the latest satellite-observed
				clarity from VIIRS and convert it to a Secchi depth, then bucket it into a coarse rating. It
				is <strong>observed, not forecast</strong> — expect a 2–3 day lag and gaps when clouds block the
				satellite.
			</p>
			<div class="mt-3 flex flex-wrap items-center gap-2">
				<span class="{chip} text-foam/80">Kd490 (m⁻¹)</span>
				<span class={arrow} aria-hidden="true">→</span>
				<span class="{chip} text-surf">Z<sub>SD</sub> ≈ {SECCHI_KD_COEFFICIENT} / Kd490</span>
				<span class={arrow} aria-hidden="true">→</span>
				<span class="{chip} text-foam/80">Secchi depth (m)</span>
			</div>
			<ul class="mt-3 flex flex-wrap gap-1.5 text-[11px]">
				{#each bands as band (band.rating)}
					<li
						class="flex items-center gap-1.5 rounded-full border border-sea/25 bg-abyss/40 px-2 py-0.5"
					>
						<span class="h-2 w-2 rounded-full {CLARITY_DOT[band.rating]}" aria-hidden="true"></span>
						<span class="text-foam/60 capitalize">{band.rating}</span>
						<span class="font-mono text-foam/45">{band.label}</span>
					</li>
				{/each}
			</ul>
		</article>

		<article class={card}>
			<h3 class="text-sm font-medium text-foam">Surf score</h3>
			<p class="mt-2 text-sm leading-relaxed text-foam/70">
				An <strong>experimental</strong> 0–10 read on how good a spot looks, from a weighted blend of
				swell size, period, direction relative to the spot's exposure, and local wind. A day's score is
				its single best hour, not an average.
			</p>
			<div class="mt-3 flex flex-wrap items-center gap-2">
				<span class="{chip} text-surf">score = 10 · Σ(wᵢ·cᵢ) / Σ(wᵢ)</span>
			</div>
			<ul class="mt-3 flex flex-col gap-2">
				{#each weights as weight (weight.label)}
					<li class="flex items-center gap-2 text-xs">
						<span class="w-20 shrink-0 text-foam/60">{weight.label}</span>
						<span class="h-2 flex-1 overflow-hidden rounded-full bg-sea/15">
							<span
								class="block h-full rounded-full bg-surf"
								style="width: {(weight.weight / maxWeight) * 100}%"
							></span>
						</span>
						<span class="w-9 shrink-0 text-right font-mono text-foam/45">
							{weight.weight.toFixed(2)}
						</span>
					</li>
				{/each}
			</ul>
			<p class="mt-2 text-[11px] text-foam/45">
				Each component scores 0–1; tide is weighted 0 in v1, so it isn't scored yet. The ramps:
			</p>
			<ul class="mt-1 grid gap-1 font-mono text-[11px] text-foam/60 sm:grid-cols-3">
				{#each COMPONENTS as component (component.name)}
					<li>c<sub>{component.name}</sub> = {component.formula}</li>
				{/each}
			</ul>
		</article>
	</section>

	<section class={card}>
		<h2 class={heading}>Data sources</h2>
		<ul class="mt-3 flex flex-col gap-4">
			{#each DATA_SOURCES as source (source.id)}
				<li>
					<a
						href={source.url}
						target="_blank"
						rel="external noreferrer"
						class="font-medium text-foam {link}"
					>
						{source.name} ↗
					</a>
					<p class="mt-1 text-xs text-foam/50">{source.org}</p>
					<p class="mt-1 text-sm leading-relaxed text-foam/70">{source.description}</p>
					<p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foam/45">
						<span
							class="rounded bg-sea/20 px-1.5 py-0.5 text-[10px] tracking-wide text-foam/60 uppercase"
						>
							{source.dataset}
						</span>
						<span>{source.cadence}</span>
						<span>· {source.license}</span>
					</p>
				</li>
			{/each}
		</ul>
	</section>

	<section class={card}>
		<h2 class={heading}>Built with</h2>
		<ul class="mt-3 grid grid-cols-1 gap-1 text-sm text-foam/70 sm:grid-cols-2">
			{#each SOFTWARE as item (item.name)}
				<li class="flex flex-wrap items-baseline gap-x-2">
					<a href={item.url} target="_blank" rel="external noreferrer" class={link}>{item.name}</a>
					<span class="text-xs text-foam/45">{item.license} · {item.note}</span>
				</li>
			{/each}
		</ul>
	</section>
</div>
