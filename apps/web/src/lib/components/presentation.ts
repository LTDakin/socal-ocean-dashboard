/**
 * `lib/components/presentation.ts` — shared display constants for the UI layer.
 *
 * Clarity rating styles live here (not in each component) so `SpotCard` and
 * `ClarityCard` can't drift, and provider ids get human labels in one place.
 * Colors are chosen to stay legible without relying on red/green alone
 * (`docs/frontend.md` → accessibility).
 */
import type { ClarityRating } from '../derive';
import type { Theme } from '../theme/palette';

/** Dark rating pill background/text, keyed by band. */
export const CLARITY_BADGE: Record<ClarityRating, string> = {
	excellent: 'bg-cyan-400/15 text-cyan-100',
	good: 'bg-sky-400/15 text-sky-100',
	fair: 'bg-slate-400/20 text-slate-100',
	poor: 'bg-amber-400/15 text-amber-100'
};

/** Dark rating dot fill, keyed by band. */
export const CLARITY_DOT: Record<ClarityRating, string> = {
	excellent: 'bg-cyan-300',
	good: 'bg-sky-300',
	fair: 'bg-slate-300',
	poor: 'bg-amber-300'
};

/** Light ratings stay black/gray; blue marks the best band. */
const LIGHT_CLARITY_BADGE: Record<ClarityRating, string> = {
	excellent: 'bg-surf/15 text-surf',
	good: 'bg-sea/10 text-foam',
	fair: 'bg-sea/10 text-foam/70',
	poor: 'bg-sea/15 text-foam ring-1 ring-sea/40'
};

const LIGHT_CLARITY_DOT: Record<ClarityRating, string> = {
	excellent: 'bg-surf',
	good: 'bg-sea/60',
	fair: 'bg-sea/35',
	poor: 'bg-sea'
};

/** Rating pill classes for the active theme. */
export function clarityBadgeClass(rating: ClarityRating, theme: Theme): string {
	return theme === 'light' ? LIGHT_CLARITY_BADGE[rating] : CLARITY_BADGE[rating];
}

/** Rating dot classes for the active theme. */
export function clarityDotClass(rating: ClarityRating, theme: Theme): string {
	return theme === 'light' ? LIGHT_CLARITY_DOT[rating] : CLARITY_DOT[rating];
}

/** Favorite star: amber in dark mode, the shared blue accent in light mode. */
export function favoriteClass(favorite: boolean, theme: Theme): string {
	if (theme === 'light') {
		return favorite ? 'text-surf hover:text-surf' : 'text-foam/35 hover:text-surf';
	}
	return favorite ? 'text-amber-300 hover:text-amber-200' : 'text-foam/35 hover:text-amber-200';
}

/** Hover border for the spot detail favorite button. */
export function favoriteBorderClass(theme: Theme): string {
	return theme === 'light' ? 'hover:border-surf/60' : 'hover:border-amber-300/60';
}

/** Active state for the dashboard's "Favorites" filter button. */
export function favoriteToggleClass(active: boolean, theme: Theme): string {
	if (!active) return '';
	return theme === 'light' ? 'border-surf/60 text-surf' : 'border-amber-300/60 text-amber-200';
}

/** Border/background/text for stale-data and safety notices. */
export function noticeClass(theme: Theme): string {
	return theme === 'light'
		? 'border-sea/30 bg-sea/5 text-foam'
		: 'border-amber-300/30 bg-amber-400/10 text-amber-100';
}

/** Inline "stale" label in the provenance footer. */
export function staleTextClass(theme: Theme): string {
	return theme === 'light' ? 'text-surf' : 'text-amber-200';
}

/** Friendlier names for the provider ids that appear in envelopes. */
const PROVIDER_LABELS: Readonly<Record<string, string>> = {
	gfswave: 'NOAA GFS-Wave',
	coops: 'NOAA CO-OPS tides',
	'coops-obs': 'NOAA CO-OPS observations',
	cdip: 'CDIP buoys',
	ndbc: 'NDBC buoys',
	coastwatch: 'CoastWatch VIIRS'
};

/** Human label for a provider id, falling back to the raw id. */
export function providerLabel(provider: string): string {
	return PROVIDER_LABELS[provider] ?? provider;
}
