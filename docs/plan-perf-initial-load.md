# Plan — initial-load performance (dashboard + detail)

Owner-facing todo: "investigate slow dashboard and detail initial load". Verdict
from measurement (see "Findings"): the dominant cost is the **cold in-process
cache**, which is expected in dev and is a one-time cost in prod. This plan
covers the follow-up improvements that were approved after verification.

## Findings (measured on this machine)

| Surface | Cold process | Warm |
|---|---|---|
| `/` (SSR) | 17.0 s | 0.30 s |
| `/api/spots` | 17.9 s | 0.33 s |
| `/spot/[id]` (SSR) | 8.1 s | 0.018 s |
| `/api/spot/[id]/forecast` | 7.6 s | 0.002 s |

- Vite dev compilation is **not** a factor (data-light `/about` ≈ 0.4 s).
- The cache (`providerCache` in `lib/providers/registry.ts` + per-adapter source
  caches) is a module-level singleton, so `pnpm dev` restarts and SSR module
  invalidation reset it. In prod (`adapter-node`) the process stays warm.
- The forecast fetches **188 NOMADS GRIB subsets** per 14-day window (f000–f120
  hourly, 3-hourly to f336) at concurrency 6; it is the detail page's cost and is
  shared across all spots per model cycle.
- The dashboard fans out to `/current` (CDIP + NDBC + CO-OPS) + `/clarity` +
  `/tides` for all 16 spots; `/current` dominates (~2.7 s/spot cold).

## Approved scope

1. **Safe bundle**
   - **Pre-warm on boot**: populate the process cache so the first visitor is
     never cold (docs/architecture.md already called for this).
   - **Cycle-scoped GRIB field cache TTL**: decoded fields for a (cycle, hour)
     are immutable, so cache them for the whole cycle instead of 1 h.
   - **In-flight dedup (single-flight)**: concurrent identical cache misses share
     one upstream fetch.
2. **Stream the detail page**: return the slow forecast unawaited so the shell
   and conditions/tide/clarity render immediately and the chart streams in.

Out of scope (not approved): reducing forecast hours, changing dashboard card
content, raising upstream concurrency, lazy-loading ECharts.

## Design

- `lib/async/single-flight.ts` — generic key→promise coalescer (unit-tested).
- `SpotDataService.load` uses single-flight around the cache-miss path;
  `createNomadsSource` uses it for shared GRIB fields.
- `lib/providers/gfswave.ts` adds `GFSWAVE_FIELD_CACHE_TTL_MS` (cycle-length) as
  the source default; the adapter/spot-level TTL is unchanged.
- `lib/providers/prewarm.ts` — `prewarmProviderCache()` warms `/api/spots` for
  every spot then one forecast (fills the shared GRIB fields). Injectable deps
  for tests; errors are logged, never thrown.
- `src/hooks.server.ts` `init()` fires pre-warm in the background. Enabled by
  default in prod; opt-in in dev via `PREWARM=1` (disabled with `PREWARM=0`). A
  `globalThis` guard makes it once-per-process (survives dev HMR).
- `spot/[id]/+page.server.ts` returns `forecast` (and a derived `provenance`
  promise) unawaited; the page uses `{#await}` for the surf strip, wave chart,
  stale banner and provenance footer.

## Verification

- `pnpm check`, `pnpm test`, `pnpm build` green.
- Cold detail SSR: shell/conditions paint before the forecast resolves (stream).
- `PREWARM=1` warms the cache so the first `/api/spots` is a cache hit.
