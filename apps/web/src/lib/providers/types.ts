/**
 * `lib/providers` — the shared contract every upstream source plugs into.
 *
 * An adapter is a thin, single-purpose, cacheable call: it knows how to fetch
 * one provider's slice for one spot and window, and nothing about the cache,
 * the response envelope, or other providers. The orchestrator in `service.ts`
 * wraps adapters with caching and assembles the contract envelope.
 *
 * Shapes here mirror `docs/api-contracts.md`; keep them in sync.
 */
import type { Spot } from '../spots';

/** Inclusive time window a provider is asked to cover. ISO-8601 UTC instants. */
export interface ForecastWindow {
	/** Window start (inclusive), e.g. `2026-10-11T00:00:00Z`. */
	start: string;
	/** Window end (inclusive). */
	end: string;
}

/** Everything an adapter is handed when asked to fetch. */
export interface ProviderContext {
	spot: Spot;
	window: ForecastWindow;
	/** Abort signal from the caller; adapters should pass it to `fetch`. */
	signal?: AbortSignal;
}

/** A successful adapter result, before caching and envelope wrapping. */
export interface ProviderPayload<T> {
	data: T;
	/** When the upstream value was produced (not when we fetched it). */
	asOf: string;
	/** Which model run produced the values, for model providers. */
	modelRun?: string;
}

/** One upstream source behind the shared `getSpotData` seam. */
export interface ProviderAdapter<T = unknown> {
	/** Stable provider id, e.g. `gfswave`. Also the cache-key prefix. */
	readonly id: string;
	/** How long a fetched payload stays fresh. */
	readonly ttlMs: number;
	/** Extra grace past `ttlMs` a payload may still be served (stale-if-error). */
	readonly staleTtlMs: number;
	/** Fetch the provider's slice. Throw on failure; the orchestrator handles it. */
	fetch(context: ProviderContext): Promise<ProviderPayload<T>>;
}

/** Per-provider provenance entry on the response envelope. */
export interface SourceRecord {
	provider: string;
	/** Present for model providers (e.g. GFS-Wave `modelRun`). */
	modelRun?: string;
	/** When the upstream value was produced. */
	asOf: string;
	/** When this process fetched it (ISO-8601). */
	fetchedAt: string;
	/** `true` when served from cache past its fresh TTL after an upstream error. */
	stale: boolean;
	/** `true` when served from cache (fresh or stale). */
	fromCache: boolean;
}

/**
 * The single response shape every endpoint returns. See `docs/api-contracts.md`.
 *
 * `asOf` is the newest source `asOf` — the vintage of the data on screen, which
 * is what "Updated X ago" reads from. `stale` is `true` if any source was served
 * stale.
 */
export interface DataEnvelope<T> {
	ok: true;
	spotId: string;
	asOf: string;
	stale: boolean;
	sources: SourceRecord[];
	data: T;
}

/** Error codes the route layer maps to HTTP status. */
export type ErrorCode = 'provider_failed' | 'not_found';

/** The `{ ok: false }` half of the contract. */
export interface ErrorEnvelope {
	ok: false;
	error: {
		code: ErrorCode;
		message: string;
		retryable: boolean;
	};
}

/** Thrown by adapters and the orchestrator; carries the contract error fields. */
export class ProviderError extends Error {
	readonly code: ErrorCode;
	readonly retryable: boolean;

	constructor(
		message: string,
		options: { code?: ErrorCode; retryable?: boolean; cause?: unknown } = {}
	) {
		super(message, { cause: options.cause });
		this.name = 'ProviderError';
		this.code = options.code ?? 'provider_failed';
		this.retryable = options.retryable ?? true;
	}
}

/** Build the `{ ok: false }` envelope from anything thrown by `getSpotData`. */
export function toErrorEnvelope(error: unknown): ErrorEnvelope {
	if (error instanceof ProviderError) {
		return {
			ok: false,
			error: { code: error.code, message: error.message, retryable: error.retryable }
		};
	}
	return {
		ok: false,
		error: {
			code: 'provider_failed',
			message: error instanceof Error ? error.message : 'Unknown provider failure',
			retryable: true
		}
	};
}

/** Stable cache/window key fragment, e.g. `2026-10-11T00:00:00Z/2026-10-25T00:00:00Z`. */
export function windowKey(window: ForecastWindow): string {
	return `${window.start}/${window.end}`;
}

/** The `provider:spotId:window` cache key from `docs/architecture.md`. */
export function cacheKey(providerId: string, spotId: string, window: ForecastWindow): string {
	return `${providerId}:${spotId}:${windowKey(window)}`;
}

/** A normalized bundle: each provider's payload, keyed by provider id. */
export type ProviderBundle = Record<string, unknown>;
