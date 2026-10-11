/**
 * `lib/attribution` — the single source of truth for data credits, software
 * credits, and the safety disclaimer.
 *
 * The app footer, the `/about` page, and the spot provenance footer all name
 * the same upstreams; keeping the copy here keeps them from drifting
 * (`docs/data-sources.md` for the upstreams, `docs/frontend.md` → `/about`).
 */

/** One upstream data provider we credit. */
export interface DataSourceCredit {
	/** Stable credit id (not the envelope provider id — see `providers`). */
	id: string;
	/** Short display name, e.g. `NOAA GFS-Wave`. */
	name: string;
	/** Publishing agency/organization. */
	org: string;
	/** What we take from the source, in one line. */
	description: string;
	/** The specific dataset/product we call. */
	dataset: string;
	/** Public documentation/landing URL. */
	url: string;
	/** Usage/licensing note. */
	license: string;
	/** Envelope `sources[].provider` ids this source satisfies. */
	providers: readonly string[];
}

/**
 * Every upstream behind a number on screen. Order is the display order on
 * `/about`; `providers` maps each to the envelope ids in `lib/providers`.
 */
export const DATA_SOURCES: readonly DataSourceCredit[] = [
	{
		id: 'gfswave',
		name: 'NOAA GFS-Wave (WAVEWATCH III)',
		org: 'NOAA / National Centers for Environmental Prediction',
		description:
			'Global wave model: significant wave height, mean & peak period, direction, and wind-wave / swell partitions.',
		dataset: 'GFS-Wave, 0.16° West Coast grid',
		url: 'https://nomads.ncep.noaa.gov/',
		license: 'U.S. Government work — public domain.',
		providers: ['gfswave']
	},
	{
		id: 'cdip',
		name: 'CDIP (Scripps)',
		org: 'Coastal Data Information Program, Scripps Institution of Oceanography, UC San Diego',
		description:
			'Nearshore wave buoy observations — the real-time “now” wave height, period, and direction.',
		dataset: 'wave_agg buoy observations (ERDDAP)',
		url: 'https://cdip.ucsd.edu/',
		license: 'Publicly available research data — please credit CDIP.',
		providers: ['cdip']
	},
	{
		id: 'coops',
		name: 'NOAA CO-OPS',
		org: 'Center for Operational Oceanographic Products and Services',
		description:
			'Astronomical tide predictions and real-time water level, water temperature, and wind.',
		dataset: 'Tide predictions (MLLW) + physical observations',
		url: 'https://tidesandcurrents.noaa.gov/',
		license: 'U.S. Government work — public domain.',
		providers: ['coops', 'coops-obs']
	},
	{
		id: 'ndbc',
		name: 'NOAA NDBC',
		org: 'National Data Buoy Center',
		description:
			'Offshore buoy observations (waves, sea temperature, wind) used to gap-fill and cross-check CDIP.',
		dataset: 'Realtime2 buoy observations',
		url: 'https://www.ndbc.noaa.gov/',
		license: 'U.S. Government work — public domain.',
		providers: ['ndbc']
	},
	{
		id: 'coastwatch',
		name: 'NOAA CoastWatch (VIIRS)',
		org: 'NOAA CoastWatch / NESDIS',
		description:
			'Satellite-observed water clarity (Kd490), converted to a Secchi depth and a coarse rating band.',
		dataset: 'VIIRS (S-NPP) NRT Kd490, daily, ~4 km',
		url: 'https://coastwatch.noaa.gov/',
		license: 'U.S. Government work — public domain.',
		providers: ['coastwatch']
	}
];

/** Software the app is built on. */
export interface SoftwareCredit {
	name: string;
	url: string;
	license: string;
	note: string;
}

export const SOFTWARE: readonly SoftwareCredit[] = [
	{ name: 'SvelteKit', url: 'https://svelte.dev/', license: 'MIT', note: 'app framework' },
	{
		name: 'Apache ECharts',
		url: 'https://echarts.apache.org/',
		license: 'Apache-2.0',
		note: 'wave, tide, and sparkline charts'
	},
	{ name: 'Tailwind CSS', url: 'https://tailwindcss.com/', license: 'MIT', note: 'styling' },
	{
		name: '@mattnucc/gribberish',
		url: 'https://github.com/mattnucc/gribberish',
		license: 'MIT',
		note: 'GRIB2 decoding for the GFS-Wave forecast'
	}
];

/** The full safety/expectation-setting disclaimer, shown on `/about`. */
export const SAFETY_DISCLAIMER =
	'Experimental and for general informational use only. Ocean and weather ' +
	'conditions change without warning. This dashboard is not a substitute for ' +
	'official forecasts, marine warnings, or your own judgment — never rely on ' +
	'it for navigation or safety-critical decisions. Always check National ' +
	'Weather Service marine forecasts and local lifeguard / Coast Guard ' +
	'guidance before entering the water.';

/** The short disclaimer carried in the app and provenance footers. */
export const SHORT_DISCLAIMER =
	'Experimental — conditions can change without warning. Not for safety-critical decisions.';

/** The credit for an envelope provider id, or `undefined` when unrouted. */
export function creditForProvider(provider: string): DataSourceCredit | undefined {
	return DATA_SOURCES.find((source) => source.providers.includes(provider));
}

/** Every envelope provider id covered by a credit, in credit order. */
export function creditedProviders(): string[] {
	return DATA_SOURCES.flatMap((source) => [...source.providers]);
}

/** Comma-joined source names, for the footer roll-up. */
export function sourceNames(): string {
	return DATA_SOURCES.map((source) => source.name).join(' · ');
}
