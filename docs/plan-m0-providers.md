# Plan — M0: Provider adapter interface + cache foundation (BFF core)

**Priority item:** `todo-list.md` → Priority 0, third bullet ("Build the
provider adapter interface + cache foundation"). Maps to `milestones.md` **M0**
(the BFF-core half).

**Status:** ✅ implemented — `lib/providers` + `lib/cache`; `pnpm --filter web
test/lint/check` and `pnpm build` green.

## Problem

Every provider (GFS-Wave, CDIP, CO-OPS, NDBC, CoastWatch) and every endpoint
(`/current`, `/forecast`, `/tides`, `/clarity`) needs the same three things:

1. One adapter contract — `getSpotData(spot, window) -> normalized bundle` — so
   adding/swapping a source stays mechanical.
2. One TTL cache keyed `provider:spotId:window`, with stale-if-error, so a busy
   public site makes a handful of upstream calls per spot per day.
3. One response envelope — `ok / spotId / asOf / stale / sources` — so the
   frontend consumes a single shape regardless of which providers were involved.

Today `lib/providers/` and `lib/cache/` are `.gitkeep` placeholders. Nothing
above them can be built until this seam exists.

## Definition of done (from the todo list)

> the stub adapter returns a bundle through cache.

Concretely: a typed adapter interface, a TTL cache that serves fresh-then-stale,
an orchestrator that turns adapter results into the contract envelope, and one
stub adapter that exercises the whole path end to end — with tests that prove a
second call is served from cache and that an upstream failure falls back to a
stale entry.

## Design

### Adapter contract (`lib/providers/types.ts`)

An adapter is a **thin, single-purpose, cacheable** call. It knows how to fetch
one provider's slice for one spot and window; it does *not* know about the
envelope, the cache, or other providers.

```ts
interface ForecastWindow { start: string; end: string }        // ISO-8601 UTC

interface ProviderContext { spot: Spot; window: ForecastWindow; signal?: AbortSignal }

interface ProviderPayload<T> {
  data: T;
  asOf: string;        // when the upstream value was produced
  modelRun?: string;   // which model run, for model providers
}

interface ProviderAdapter<T = unknown> {
  id: string;
  ttlMs: number;        // how long a payload stays fresh
  staleTtlMs: number;   // extra grace past ttlMs for stale-if-error
  fetch(ctx: ProviderContext): Promise<ProviderPayload<T>>;
}
```

Adapters **throw** on upstream failure; the orchestrator decides whether a
cached-but-stale payload can cover the gap.

### Cache (`lib/cache/index.ts`)

A small in-process TTL map (architecture decision #5: in-process now, Redis only
if we run multiple instances). Injectable clock so tests are deterministic.

```ts
cache.set(key, value, ttlMs, staleTtlMs)
cache.get(key)        // fresh only -> T | undefined
cache.read(key)       // { value, fresh, storedAt, expiresAt } | undefined (stale ok)
cache.sweep()         // drop entries past staleUntil
```

Keys are opaque strings; the provider layer builds `provider:spotId:window`.

### Orchestrator + envelope (`lib/providers/service.ts`)

```ts
getSpotData(spot, window, { providers?, signal?, forceRefresh? })
  -> Promise<DataEnvelope<Record<string, unknown>>>
```

For each selected adapter, in order:

1. Read the cache key `adapter.id:spot.id:windowKey(window)`.
2. **Fresh hit** → use it (`fromCache: true`).
3. Otherwise call `adapter.fetch`; on success cache it and use it.
4. On fetch **failure** → if a stale entry exists (within `staleTtlMs`) serve it
   with `stale: true`; otherwise throw `ProviderError`.

The envelope is assembled per `docs/api-contracts.md`:

- `ok: true`, `spotId`, `data` (keyed by provider id).
- `asOf` = the **newest source `asOf`** (the data's vintage — what "Updated X ago"
  reads from). Documented here because the contract comment is ambiguous.
- `stale` = true if **any** source was served stale (staleness is a warning).
- `sources[]` = `{ provider, modelRun?, asOf, fetchedAt, stale, fromCache }`.
- `toErrorEnvelope(error)` builds `{ ok: false, error: { code, message, retryable } }`
  from a thrown `ProviderError` for the route layer.

**Scope decision:** all-or-nothing. If a selected adapter can neither fetch nor
fall back to stale data, the whole call throws. Partial/degraded bundles are a
later resilience concern; the contract has no field for per-provider warnings.

### Stub adapter (`lib/providers/stub.ts`)

Deterministic synthetic data (derived from `spot.id`, timestamps from the
window) so it never touches the network. It exercises the seam end to end and
gives the frontend something to render before real adapters land. `id: 'stub'`,
TTLs `60s / 6h`.

## Files

```
apps/web/src/lib/cache/
  index.ts            # TtlCache (+ injectable clock)
  cache.spec.ts       # fresh/stale/expiry/sweep, fake clock
apps/web/src/lib/providers/
  types.ts            # window, context, payload, adapter, envelope, ProviderError
  service.ts          # getSpotData orchestrator + envelope assembly
  stub.ts             # deterministic stub adapter
  index.ts            # barrel + default cache/service wiring
  providers.spec.ts   # end-to-end: bundle through cache, stale fallback, envelope
```

(`.gitkeep` placeholders in `lib/cache/` and `lib/providers/` removed.)

## Out of scope

- Real provider adapters (GFS-Wave, CDIP, CO-OPS, …) — later todos.
- `GET /api/*` routes and any UI.
- Rate limiting / retry / backoff / pre-warm / telemetry (deferred resilience).
- Redis / cross-instance cache.

## Verification

1. `pnpm --filter web test` → cache + provider specs pass, including a second
   `getSpotData` call served from cache and a stale-if-error path.
2. `pnpm lint && pnpm check && pnpm build` green.
3. Manual read: the envelope returned by `getSpotData` matches
   `docs/api-contracts.md` (`ok/spotId/asOf/stale/sources`).

---

## Outcome

Shipped as planned:

- `lib/cache/index.ts` — `TtlCache` with a fresh→stale→evicted lifecycle,
  injectable clock, `maxEntries` eviction, and `sweep()`.
- `lib/providers/types.ts` — `ForecastWindow`, `ProviderContext`,
  `ProviderPayload`, `ProviderAdapter`, `DataEnvelope`, `ErrorEnvelope`,
  `ProviderError`, `toErrorEnvelope`, plus `windowKey`/`cacheKey` helpers.
- `lib/providers/service.ts` — `getSpotData(spot, window, options?)` orchestrator
  (fresh hit → fetch → stale-if-error) and envelope assembly.
- `lib/providers/stub.ts` — deterministic offline stub adapter.
- `lib/providers/index.ts` — barrel + a shared `providerCache`.
- `cache.spec.ts` (5 tests) and `providers.spec.ts` (7 tests) covering cache
  lifecycle, cache-through on the second call, stale-if-error, the `not_found`
  path, and stub determinism.

Minor decisions worth flagging:

- `DataEnvelope.asOf` is the **newest source `asOf`** (data vintage), and
  `stale` is true if **any** source is stale. The contract comment for `asOf`
  was ambiguous ("when this bundle was produced"); documented in `types.ts`.
- **All-or-nothing** fetching: a selected adapter that can neither fetch nor
  fall back to stale data fails the whole call. Partial bundles have no field on
  the contract and are left to the deferred resilience layer.
- The exported `providerCache` is the process-wide cache real adapters will
  register against; the stub is not registered by default.

**Verification run (all green):** `pnpm --filter web test` ✅ (19 tests) ·
`pnpm --filter web check` ✅ (0 errors) · `pnpm --filter web lint` ✅ ·
`pnpm build` ✅.

