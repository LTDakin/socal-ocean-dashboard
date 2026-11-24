/**
 * `lib/dashboard/spot-ranking.ts` — pure sort key for the dashboard spot list.
 *
 * Lives in `lib/` because the browser sorts the `/api/spots` rows on filter and
 * favorite changes. It only reads the wire shape, never a provider.
 */
import type { SpotOverview } from './types';

/**
 * Count the dashboard fields that carry a value (0-12). The list sorts by this
 * so spots with real information lead and sparse or unobserved spots trail
 * (`docs/frontend.md`). It is deliberately a presence count, not a quality
 * judgement — a present-but-stale reading still counts.
 */
export function spotInfoScore(spot: SpotOverview): number {
	const snapshot = spot.snapshot;
	let score = 0;
	for (const value of [
		snapshot.waveHeightM,
		snapshot.wavePeriodS,
		snapshot.waveDirDeg,
		snapshot.waterTempC,
		snapshot.windSpeedMs,
		snapshot.windDirDeg,
		snapshot.waterLevelM,
		snapshot.tideState,
		snapshot.clarityRating
	]) {
		if (value !== null) score += 1;
	}
	if (spot.observedAt) score += 1;
	if (spot.clarityObservedAt) score += 1;
	if (spot.tide && spot.tide.preview.length > 0) score += 1;
	return score;
}

/** Sort key: most information first, then alphabetical to break ties. */
export function compareSpotsByInfo(a: SpotOverview, b: SpotOverview): number {
	return spotInfoScore(b) - spotInfoScore(a) || a.name.localeCompare(b.name);
}
