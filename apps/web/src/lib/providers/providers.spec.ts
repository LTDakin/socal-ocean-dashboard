import { describe, expect, it } from 'vitest';
import { TtlCache } from '../cache';
import { getSpot, type Spot } from '../spots';
import { createSpotDataService, SpotDataService } from './service';
import { buildStubSlide, createStubAdapter } from './stub';
import {
	ProviderError,
	toErrorEnvelope,
	type ForecastWindow,
	type ProviderAdapter,
	type ProviderPayload
} from './types';

const window: ForecastWindow = { start: '2026-10-11T00:00:00Z', end: '2026-10-12T00:00:00Z' };

function spotOrThrow(id: string): Spot {
	const spot = getSpot(id);
	if (!spot) throw new Error(`test fixture spot missing: ${id}`);
	return spot;
}

const spot = spotOrThrow('la-jolla-shores');

/** Controllable clock shared by the cache and the service. */
function fakeClock(start = 1_700_000_000_000) {
	let t = start;
	return {
		now: () => t,
		advance: (ms: number) => {
			t += ms;
			return t;
		}
	};
}

describe('SpotDataService.getSpotData', () => {
	it('returns a normalized bundle and serves the second call from cache', async () => {
		const clock = fakeClock();
		const cache = new TtlCache({ now: clock.now });
		let fetches = 0;
		const adapter: ProviderAdapter<{ n: number }> = {
			id: 'gfswave',
			ttlMs: 60_000,
			staleTtlMs: 3_600_000,
			async fetch(): Promise<ProviderPayload<{ n: number }>> {
				fetches += 1;
				return {
					data: { n: fetches },
					asOf: '2026-10-11T00:00:00Z',
					modelRun: '2026-10-11T00:00:00Z'
				};
			}
		};
		const service = createSpotDataService({ adapters: [adapter], cache, now: clock.now });

		const first = await service.getSpotData(spot, window);
		expect(first.ok).toBe(true);
		expect(first.spotId).toBe('la-jolla-shores');
		expect(first.stale).toBe(false);
		expect(first.data.gfswave).toEqual({ n: 1 });
		expect(first.sources).toHaveLength(1);
		expect(first.sources[0]).toMatchObject({
			provider: 'gfswave',
			modelRun: '2026-10-11T00:00:00Z',
			asOf: '2026-10-11T00:00:00Z',
			stale: false,
			fromCache: false
		});

		const second = await service.getSpotData(spot, window);
		expect(fetches).toBe(1);
		expect(second.data.gfswave).toEqual({ n: 1 });
		expect(second.sources[0].fromCache).toBe(true);
	});

	it('sets envelope asOf to the newest source and stale when any source is stale', async () => {
		const clock = fakeClock();
		const cache = new TtlCache({ now: clock.now });
		const old: ProviderAdapter = {
			id: 'coops',
			ttlMs: 1_000,
			staleTtlMs: 60_000,
			async fetch() {
				return { data: 'tide', asOf: '2026-10-10T00:00:00Z' };
			}
		};
		let cdipFails = false;
		const flaky: ProviderAdapter = {
			id: 'cdip',
			ttlMs: 1_000,
			staleTtlMs: 60_000,
			async fetch() {
				if (cdipFails) throw new Error('upstream down');
				return { data: 'buoy', asOf: '2026-10-11T12:00:00Z' };
			}
		};
		const service = createSpotDataService({ adapters: [old, flaky], cache, now: clock.now });

		const fresh = await service.getSpotData(spot, window);
		expect(fresh.asOf).toBe('2026-10-11T12:00:00Z');
		expect(fresh.stale).toBe(false);

		clock.advance(2_000); // both entries now stale
		cdipFails = true;
		const degraded = await service.getSpotData(spot, window);
		expect(degraded.stale).toBe(true);
		expect(degraded.data.cdip).toBe('buoy');
		expect(degraded.sources.find((s) => s.provider === 'cdip')?.stale).toBe(true);
	});

	it('falls back to a stale cache entry when an upstream fetch fails', async () => {
		const clock = fakeClock();
		const cache = new TtlCache({ now: clock.now });
		let failing = false;
		const adapter: ProviderAdapter = {
			id: 'gfswave',
			ttlMs: 1_000,
			staleTtlMs: 60_000,
			async fetch() {
				if (failing) throw new ProviderError('nomads timeout');
				return { data: { waveHeightM: 0.95 }, asOf: '2026-10-11T00:00:00Z' };
			}
		};
		const service = new SpotDataService({ adapters: [adapter], cache, now: clock.now });

		await service.getSpotData(spot, window);
		clock.advance(2_000);
		failing = true;

		const result = await service.getSpotData(spot, window);
		expect(result.stale).toBe(true);
		expect(result.data.gfswave).toEqual({ waveHeightM: 0.95 });
		expect(result.sources[0]).toMatchObject({ stale: true, fromCache: true });
	});

	it('throws provider_failed when there is no cache to fall back on', async () => {
		const adapter: ProviderAdapter = {
			id: 'gfswave',
			ttlMs: 1_000,
			staleTtlMs: 60_000,
			async fetch() {
				throw new Error('nomads exploded');
			}
		};
		const service = createSpotDataService({ adapters: [adapter] });

		await expect(service.getSpotData(spot, window)).rejects.toBeInstanceOf(ProviderError);
		const error = await service.getSpotData(spot, window).catch((e: unknown) => e);
		expect(toErrorEnvelope(error)).toMatchObject({
			ok: false,
			error: { code: 'provider_failed', retryable: true }
		});
	});

	it('rejects an unknown provider without calling any adapter', async () => {
		const service = createSpotDataService({ adapters: [createStubAdapter()] });
		await expect(service.getSpotData(spot, window, { providers: ['nope'] })).rejects.toMatchObject({
			code: 'not_found'
		});
	});
});

describe('stub adapter', () => {
	it('returns a deterministic bundle through the full cache path', async () => {
		const service = createSpotDataService({ adapters: [createStubAdapter()] });
		const result = await service.getSpotData(spot, window);

		expect(result.ok).toBe(true);
		expect(result.sources.map((s) => s.provider)).toEqual(['stub']);
		expect(result.data.stub).toEqual(buildStubSlide('la-jolla-shores', window));

		const repeated = await service.getSpotData(spot, window);
		expect(repeated.data.stub).toEqual(result.data.stub);
		expect(repeated.sources[0].fromCache).toBe(true);
	});

	it('builds a stable, bounded series', () => {
		const a = buildStubSlide('huntington-beach', window);
		const b = buildStubSlide('huntington-beach', window);
		expect(a).toEqual(b);
		expect(a.points.length).toBeGreaterThan(0);
		expect(a.points.length).toBeLessThanOrEqual(24);
		for (const point of a.points) {
			expect(point.waveHeightM).toBeGreaterThan(0);
			expect(point.directionDeg).toBeGreaterThanOrEqual(0);
			expect(point.directionDeg).toBeLessThan(360);
		}
	});
});
