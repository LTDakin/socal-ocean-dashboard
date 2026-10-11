<script lang="ts">
	import { DATA_SOURCES, SAFETY_DISCLAIMER, SOFTWARE } from '../../lib/attribution';

	const card = 'rounded-xl border border-sea/25 bg-deep/40 p-4';
	const heading = 'text-sm font-semibold tracking-wide text-foam/50 uppercase';
	const link = 'text-surf underline-offset-2 transition hover:text-foam hover:underline';
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
		<h2 class={heading}>How each number is made</h2>
		<dl class="mt-3 flex flex-col gap-4 text-sm text-foam/70">
			<div>
				<dt class="font-medium text-foam">Wave &amp; swell forecast</dt>
				<dd class="mt-1 leading-relaxed">
					NOAA's WAVEWATCH III (GFS-Wave) global model, sampled at each spot's offshore deep-water
					point. We keep the full ~14-day window — hourly out to +120&nbsp;h, then three-hourly —
					and split the combined sea into its wind-wave and swell partitions (height, period,
					direction). The chart shows each day's maximum significant wave and swell height, with the
					dominant period overlaid. This is a <em>deep-water</em> model: it does not resolve how a specific
					beach refracts, focuses, or blocks a swell.
				</dd>
			</div>
			<div>
				<dt class="font-medium text-foam">Current conditions ("now")</dt>
				<dd class="mt-1 leading-relaxed">
					Real observations, not model output. Nearshore buoys come from CDIP (Scripps); when a CDIP
					buoy is quiet we gap-fill from its NDBC twin. Each field is taken from the best available
					source — waves from the newest buoy reading, water temperature from the buoy when it
					reports (otherwise the shore sensor), wind from the station with both speed and direction
					— and carries its own provider and observation time, shown in the conditions panel.
				</dd>
			</div>
			<div>
				<dt class="font-medium text-foam">Tides</dt>
				<dd class="mt-1 leading-relaxed">
					Astronomical predictions from NOAA CO-OPS for the spot's tide station, referenced to Mean
					Lower Low Water (MLLW), with high and low events marked on the curve. Predictions are
					constant for the year; the live tide <em>state</em> (rising / falling) comes from the observed
					water-level trend instead.
				</dd>
			</div>
			<div>
				<dt class="font-medium text-foam">Water clarity &amp; visibility</dt>
				<dd class="mt-1 leading-relaxed">
					There is no forecast for underwater visibility. We show the latest satellite-observed
					clarity from VIIRS (Kd490, ~4&nbsp;km, daily) and convert it to a Secchi depth with Kirk's
					relation, <span class="whitespace-nowrap">Z<sub>SD</sub> ≈ 1.44 / Kd490</span>, then
					bucket it into a coarse rating (poor → excellent). It is
					<strong>observed, not forecast</strong>: expect a 2–3 day lag and gaps when clouds block
					the satellite.
				</dd>
			</div>
			<div>
				<dt class="font-medium text-foam">Surf score</dt>
				<dd class="mt-1 leading-relaxed">
					An <strong>experimental</strong> 0–10 number summarising how good a spot looks, from a weighted
					blend of swell size, period, direction relative to the spot's exposure, and local wind. A day's
					score is its single best hour, not an average. Treat it as a quick read, not a verdict — tune
					it with your own experience.
				</dd>
			</div>
		</dl>
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
					<p class="mt-1 text-xs text-foam/45">
						{source.dataset} · {source.license}
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
