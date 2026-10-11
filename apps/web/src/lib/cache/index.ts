/**
 * `lib/cache` — the in-process TTL cache the BFF core is built on.
 *
 * Architecture decision #5: an in-process TTL map is enough for v1; Redis only
 * if/when we run multiple instances. Entries are keyed by opaque strings — the
 * provider layer owns the `provider:spotId:window` convention.
 *
 * Staleness model, per `docs/architecture.md` ("stale-if-error"): an entry is
 * *fresh* until `ttlMs` elapses, then *stale* (but still readable) until
 * `staleTtlMs` further elapses, after which it is dropped. Providers set the
 * window; the orchestrator prefers fresh and falls back to stale on upstream
 * failure.
 */

interface TtlEntry {
	value: unknown;
	/** Epoch ms the entry was written. */
	storedAt: number;
	/** Epoch ms after which the entry is stale. */
	expiresAt: number;
	/** Epoch ms after which the entry is dropped. */
	staleUntil: number;
}

/** A cache read that may be fresh or stale. */
export interface CacheRead<T> {
	value: T;
	/** `true` while within the fresh window, `false` while stale. */
	fresh: boolean;
	storedAt: number;
	expiresAt: number;
}

export interface TtlCacheOptions {
	/** Injectable clock (epoch ms). Defaults to `Date.now`. */
	now?: () => number;
	/** Soft cap; when exceeded, the oldest entries are swept on `set`. */
	maxEntries?: number;
}

/** In-process TTL cache with a fresh→stale→evicted lifecycle. */
export class TtlCache {
	private readonly entries = new Map<string, TtlEntry>();
	private readonly now: () => number;
	private readonly maxEntries: number;

	constructor(options: TtlCacheOptions = {}) {
		this.now = options.now ?? Date.now;
		this.maxEntries = options.maxEntries ?? 5_000;
	}

	/** Store `value` fresh for `ttlMs`, then stale for `staleTtlMs` longer. */
	set<T>(key: string, value: T, ttlMs: number, staleTtlMs = 0): void {
		const storedAt = this.now();
		this.entries.set(key, {
			value,
			storedAt,
			expiresAt: storedAt + Math.max(0, ttlMs),
			staleUntil: storedAt + Math.max(0, ttlMs) + Math.max(0, staleTtlMs)
		});
		if (this.entries.size > this.maxEntries) this.evictOldest();
	}

	/** Fresh value only, or `undefined` once stale/evicted. */
	get<T>(key: string): T | undefined {
		const hit = this.read<T>(key);
		return hit?.fresh ? hit.value : undefined;
	}

	/** Fresh-or-stale read, or `undefined` once past the stale window. */
	read<T>(key: string): CacheRead<T> | undefined {
		const entry = this.entries.get(key);
		if (!entry) return undefined;
		const now = this.now();
		if (now >= entry.staleUntil) {
			this.entries.delete(key);
			return undefined;
		}
		return {
			value: entry.value as T,
			fresh: now < entry.expiresAt,
			storedAt: entry.storedAt,
			expiresAt: entry.expiresAt
		};
	}

	has(key: string): boolean {
		return this.read(key) !== undefined;
	}

	delete(key: string): boolean {
		return this.entries.delete(key);
	}

	clear(): void {
		this.entries.clear();
	}

	get size(): number {
		return this.entries.size;
	}

	/** Drop entries past their stale window. Returns how many were removed. */
	sweep(): number {
		const now = this.now();
		let removed = 0;
		for (const [key, entry] of this.entries) {
			if (now >= entry.staleUntil) {
				this.entries.delete(key);
				removed += 1;
			}
		}
		return removed;
	}

	private evictOldest(): void {
		// Map preserves insertion order, so the first key is the oldest write.
		const oldest = this.entries.keys().next();
		if (!oldest.done) this.entries.delete(oldest.value);
	}
}
