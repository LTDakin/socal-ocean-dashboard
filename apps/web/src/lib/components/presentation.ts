/**
 * `lib/components/presentation.ts` — shared display constants for the UI layer.
 *
 * Clarity rating styles live here (not in each component) so `SpotCard` and
 * `ClarityCard` can't drift, and provider ids get human labels in one place.
 * Colors are chosen to stay legible without relying on red/green alone
 * (`docs/frontend.md` → accessibility).
 */
import type { ClarityRating } from '../derive';

/** Rating pill background/text, keyed by band. */
export const CLARITY_BADGE: Record<ClarityRating, string> = {
	excellent: 'bg-cyan-400/15 text-cyan-100',
	good: 'bg-sky-400/15 text-sky-100',
	fair: 'bg-slate-400/20 text-slate-100',
	poor: 'bg-amber-400/15 text-amber-100'
};

/** Rating dot fill, keyed by band. */
export const CLARITY_DOT: Record<ClarityRating, string> = {
	excellent: 'bg-cyan-300',
	good: 'bg-sky-300',
	fair: 'bg-slate-300',
	poor: 'bg-amber-300'
};

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
