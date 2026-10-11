/**
 * `lib/providers/stub.ts` — a deterministic, offline adapter that exercises the
 * `getSpotData` seam end to end.
 *
 * It touches no network and derives everything from the spot id and window, so
 * it is stable in tests and gives the frontend something to render before the
 * real adapters land. Values are synthetic and must never reach a user-facing
 * claim of accuracy.
 */
import type { ForecastWindow, ProviderAdapter, ProviderContext, ProviderPayload } from './types';

const HOUR_MS = 60 * 60 * 1000;
const MAX_POINTS = 24;

/** One synthetic forecast sample. `snake` fields stay metric (SI). */
export interface StubPoint {
	time: string;
	waveHeightM: number;
	periodS: number;
	directionDeg: number;
	waterTempC: number;
}

/** A stub provider's slice: a short synthetic series for one spot. */
export interface StubSlide {
	spotId: string;
	points: StubPoint[];
}

/** Deterministic 32-bit hash (FNV-1a) so stub values are stable per spot. */
function hash(input: string): number {
	let h = 2166136261;
	for (let i = 0; i < input.length; i += 1) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

function round(value: number, digits: number): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

/** Build the deterministic slide for a spot/window. Exported for tests. */
export function buildStubSlide(spotId: string, window: ForecastWindow): StubSlide {
	const phase = (hash(spotId) % 628) / 100; // 0..2π
	const heading = hash(`${spotId}:dir`) % 360;
	const baseTemp = 15 + (hash(`${spotId}:temp`) % 80) / 10; // 15..23 °C

	const startMs = Date.parse(window.start);
	const endMs = Date.parse(window.end);
	const span = Number.isFinite(endMs) && endMs > startMs ? endMs - startMs : 0;
	const count = Math.max(1, Math.min(MAX_POINTS, Math.floor(span / HOUR_MS) + 1));

	const points: StubPoint[] = [];
	for (let i = 0; i < count; i += 1) {
		const waveHeightM = round(1.2 + 0.6 * Math.sin(i / 3 + phase), 2);
		const periodS = round(11 + 3 * Math.sin(i / 5 + phase), 1);
		const directionDeg = (heading + Math.round(10 * Math.sin(i / 4))) % 360;
		const waterTempC = round(baseTemp + 0.8 * Math.sin(i / 6 + phase), 1);
		points.push({
			time: new Date(startMs + i * HOUR_MS).toISOString(),
			waveHeightM,
			periodS,
			directionDeg,
			waterTempC
		});
	}

	return { spotId, points };
}

/**
 * Create the stub adapter. `id` is overridable so a test can register two
 * independent instances.
 */
export function createStubAdapter(id = 'stub'): ProviderAdapter<StubSlide> {
	return {
		id,
		ttlMs: 60 * 1000,
		staleTtlMs: 6 * HOUR_MS,
		async fetch({ spot, window }: ProviderContext): Promise<ProviderPayload<StubSlide>> {
			return { data: buildStubSlide(spot.id, window), asOf: window.start };
		}
	};
}
