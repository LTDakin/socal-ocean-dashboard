/**
 * `lib/derive` — derived metrics kept separate from raw provider adapters so they
 * can be reasoned about and unit-tested in isolation (`AGENTS.md`).
 *
 * - `daily` — per-day wave/swell extremes for the forecast `daily[]` contract.
 * - `clarity` — Secchi depth + rating band from observed Kd490.
 * - `surf-score` — the experimental 0-10 surf score.
 */
export { aggregateDaily } from './daily';
export type { DailyWavePoint, DailyWaveSummary } from './daily';
export {
	CLARITY_BANDS,
	SECCHI_KD_COEFFICIENT,
	clarityRating,
	deriveClarity,
	secchiDepthM
} from './clarity';
export type { ClarityBand, ClarityRating, ClaritySummary } from './clarity';
export {
	DEFAULT_SURF_SCORE_CONFIG,
	angleBetweenDeg,
	scoreSurf,
	scoreSurfByDay,
	scoreSurfComponents
} from './surf-score';
export type {
	DailySurfScore,
	SurfScoreComponents,
	SurfScoreConfig,
	SurfScoreInput,
	SurfScoreResult,
	SurfScoreTimedInput
} from './surf-score';
