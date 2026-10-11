/**
 * `lib/providers/service.ts` — the `getSpotData(spot, window)` seam.
 *
 * Wraps each adapter with the TTL cache and assembles the contract envelope
 * (`docs/api-contracts.md`). Adapters stay dumb: they fetch and throw. This
 * layer decides fresh-vs-stale and builds provenance.
 */
import { createSingleFlight } from '../async/single-flight';
import { TtlCache, type CacheRead } from '../cache';
import type { Spot } from '../spots';
import {
	cacheKey,
	ProviderError,
	type DataEnvelope,
	type ForecastWindow,
	type ProviderAdapter,
	type ProviderBundle,
	type ProviderPayload,
	type SourceRecord
} from './types';

export interface GetSpotDataOptions {
	/** Limit to these provider ids; defaults to every registered adapter. */
	providers?: string[];
	/** Propagated to each adapter's `fetch`. */
	signal?: AbortSignal;
	/** Skip the fresh-cache check and refetch (stale fallback still applies). */
	forceRefresh?: boolean;
}

export interface SpotDataServiceOptions {
	adapters: ProviderAdapter[];
	/** Defaults to a fresh in-process cache. */
	cache?: TtlCache;
	/** Injectable clock (epoch ms), used for `fetchedAt`. Defaults to `Date.now`. */
	now?: () => number;
}

interface LoadedSource {
	provider: string;
	payload: ProviderPayload<unknown>;
	stale: boolean;
	fromCache: boolean;
	fetchedAt: number;
}

/** Orchestrates adapters through cache into the response envelope. */
export class SpotDataService {
	private readonly adapters: ProviderAdapter[];
	private readonly cache: TtlCache;
	private readonly now: () => number;
	private readonly singleFlight = createSingleFlight();

	constructor(options: SpotDataServiceOptions) {
		this.adapters = options.adapters;
		this.cache = options.cache ?? new TtlCache();
		this.now = options.now ?? Date.now;
	}

	/**
	 * Build the normalized bundle for a spot over a window, through cache.
	 *
	 * All-or-nothing by design: if a selected adapter can neither fetch nor fall
	 * back to a stale entry, the call throws. Partial/degraded bundles are a
	 * later resilience concern and have no field on the contract.
	 */
	async getSpotData(
		spot: Spot,
		window: ForecastWindow,
		options: GetSpotDataOptions = {}
	): Promise<DataEnvelope<ProviderBundle>> {
		const adapters = this.select(options.providers);
		const loaded = await Promise.all(
			adapters.map((adapter) =>
				this.load(adapter, spot, window, {
					signal: options.signal,
					forceRefresh: options.forceRefresh ?? false
				})
			)
		);

		const data: ProviderBundle = {};
		for (const source of loaded) data[source.provider] = source.payload.data;

		return {
			ok: true,
			spotId: spot.id,
			asOf: newestAsOf(loaded),
			stale: loaded.some((source) => source.stale),
			sources: loaded.map(toSourceRecord),
			data
		};
	}

	private select(providers?: string[]): ProviderAdapter[] {
		if (!providers) return this.adapters;
		const wanted = new Set(providers);
		const selected = this.adapters.filter((adapter) => wanted.has(adapter.id));
		const missing = providers.filter((id) => !selected.some((adapter) => adapter.id === id));
		if (missing.length > 0) {
			throw new ProviderError(`Unknown provider(s): ${missing.join(', ')}`, {
				code: 'not_found',
				retryable: false
			});
		}
		return selected;
	}

	private load(
		adapter: ProviderAdapter,
		spot: Spot,
		window: ForecastWindow,
		options: { signal?: AbortSignal; forceRefresh: boolean }
	): Promise<LoadedSource> {
		const key = cacheKey(adapter.id, spot.id, window);

		if (!options.forceRefresh) {
			const hit = this.cache.read<ProviderPayload<unknown>>(key);
			if (hit?.fresh) return Promise.resolve(freshHit(adapter.id, hit));
		}

		// Collapse concurrent cache misses for the same key into one upstream
		// fetch (dashboard + detail + pre-warm can all request it at once).
		return this.singleFlight(key, () => this.loadUncached(adapter, spot, window, key, options));
	}

	private async loadUncached(
		adapter: ProviderAdapter,
		spot: Spot,
		window: ForecastWindow,
		key: string,
		options: { signal?: AbortSignal; forceRefresh: boolean }
	): Promise<LoadedSource> {
		// A queued caller may have filled the cache before we started.
		if (!options.forceRefresh) {
			const hit = this.cache.read<ProviderPayload<unknown>>(key);
			if (hit?.fresh) return freshHit(adapter.id, hit);
		}

		try {
			const payload = await adapter.fetch({ spot, window, signal: options.signal });
			const fetchedAt = this.now();
			this.cache.set(key, payload, adapter.ttlMs, adapter.staleTtlMs);
			return { provider: adapter.id, payload, stale: false, fromCache: false, fetchedAt };
		} catch (cause) {
			// Stale-if-error: serve the last good payload rather than failing.
			const hit = this.cache.read<ProviderPayload<unknown>>(key);
			if (hit) {
				return {
					provider: adapter.id,
					payload: hit.value,
					stale: true,
					fromCache: true,
					fetchedAt: hit.storedAt
				};
			}
			if (cause instanceof ProviderError) throw cause;
			throw new ProviderError(`${adapter.id} failed`, { retryable: true, cause });
		}
	}
}

/** A fresh cache hit, shaped as a loaded source. */
function freshHit(provider: string, hit: CacheRead<ProviderPayload<unknown>>): LoadedSource {
	return { provider, payload: hit.value, stale: false, fromCache: true, fetchedAt: hit.storedAt };
}

/** Newest source `asOf`; falls back to epoch 0 never happens (success needs ≥1). */
function newestAsOf(sources: LoadedSource[]): string {
	let newest = '';
	for (const source of sources) {
		if (source.payload.asOf > newest) newest = source.payload.asOf;
	}
	return newest;
}

function toSourceRecord(source: LoadedSource): SourceRecord {
	return {
		provider: source.provider,
		...(source.payload.modelRun ? { modelRun: source.payload.modelRun } : {}),
		asOf: source.payload.asOf,
		fetchedAt: new Date(source.fetchedAt).toISOString(),
		stale: source.stale,
		fromCache: source.fromCache
	};
}

/** Convenience: build a service from a set of adapters. */
export function createSpotDataService(options: SpotDataServiceOptions): SpotDataService {
	return new SpotDataService(options);
}
