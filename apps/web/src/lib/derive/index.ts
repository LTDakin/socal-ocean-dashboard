/**
 * `lib/derive` — derived metrics kept separate from raw provider adapters so they
 * can be reasoned about and unit-tested in isolation (`AGENTS.md`).
 */
export { aggregateDaily } from './daily';
export type { DailyWavePoint, DailyWaveSummary } from './daily';
