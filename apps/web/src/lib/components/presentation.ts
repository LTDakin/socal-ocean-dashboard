/**
 * `lib/components/presentation.ts` — shared display constants for the UI layer.
 *
 * Clarity rating styles live here (not in each component) so `SpotCard` and
 * `ClarityCard` can't drift, and provider ids get human labels in one place.
 * All bands use the same green→red ramp in both themes; badge text follows the
 * active theme's foreground token, and the band label stays visible so color is
 * never the only cue (`docs/frontend.md` → accessibility).
 */
import type { ClarityRating } from '../derive';
import { DATA_COLORS, withAlpha } from '../theme/data-colors';
import type { Theme } from '../theme/palette';

/** Visibility ramp, green (excellent) → red (poor), keyed by band. */
const CLARITY_COLORS: Record<ClarityRating, string> = {
	excellent: DATA_COLORS.green,
	good: DATA_COLORS.yellow,
	fair: DATA_COLORS.orange,
	poor: DATA_COLORS.red
};

/** Tinted pill style for a clarity band. */
export function clarityBadgeStyle(rating: ClarityRating): string {
	return `background-color: ${withAlpha(CLARITY_COLORS[rating], 0.15)}; color: var(--color-foam)`;
}

/** Solid dot style for a clarity band. */
export function clarityDotStyle(rating: ClarityRating): string {
	return `background-color: ${CLARITY_COLORS[rating]}`;
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
