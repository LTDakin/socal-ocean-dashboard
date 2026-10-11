# Plan — M3 (part 3): clarity service (`/clarity`)

**Priority item:** `todo-list.md` → Priority 2, third bullet ("Build the clarity
service"). Maps to the last open item of `milestones.md` **M3** and the
`/api/spot/[id]/clarity` contract.

**Status:** ✅ implemented — CoastWatch VIIRS Kd490 adapter + `/clarity`
endpoint, derived Secchi depth + rating, labeled "observed, not forecast".
Fixture-backed, offline tests. `pnpm --filter web test/lint/check` and `pnpm build`
green; live-verified against CoastWatch.

## Problem

There is no forecast for underwater visibility. Divers (and surfers reading water
quality) want the most recent satellite-derived clarity. NOAA CoastWatch
publishes VIIRS Kd490 (the diffuse attenuation coefficient at 490 nm) as a daily
Level-3 product with a 2–3 day latency, riddled with cloud gaps. This item adds
the adapter and the `/clarity` endpoint that turns the latest cloud-free pixel
into a Secchi depth + rating band.

## Definition of done (from the todo list)

> A spot shows observed clarity + rating + `asOf`.

Concretely: `/api/spot/[id]/clarity` returns an envelope whose `data.clarity`
carries the latest observed `kd490`, the derived `secchiDepthM` and `rating`
(`poor | fair | good | excellent`), and the satellite observation time, with a
fixture-backed test proving the parse + derive deterministically (no live network
in CI, `AGENTS.md` rule 8).

## Design

### Source (adapter `coastwatch` in `lib/providers`)

| Adapter id   | Upstream                                                          | Contributes              | TTL / stale |
| ------------ | ----------------------------------------------------------------- | ------------------------ | ----------- |
| `coastwatch` | CoastWatch ERDDAP `griddap/nesdisVHNkd490Daily` (VIIRS NRT Kd490) | observed clarity (Kd490) | 24 h / 7 d  |

The adapter follows the existing `ProviderAdapter<T>` contract and registers
against the process-wide `providerCache`.

**Sample point is the spot's `offshoreModelPoint`.** VIIRS is ~4 km (0.0375°); the
nearest pixel to the shoreline is often a land/mixed cell, so we sample the same
in-water point the wave forecast uses. The response's actual pixel is echoed on
the payload (`pixel`) so the UI can be honest that it is a 4 km cell, not the
beach.

**Cloud gaps fall back, not fail.** The product is one row per day at 12:00Z with
`null` (ERDDAP's `_FillValue` NaN) where the satellite saw cloud. The adapter
queries a **10-day lookback** in a single griddap call
(`[(start):1:last][(0.0)][(lat)][(lon)]`) and takes the newest row with a finite,
strictly-positive Kd490. `1:last` lets ERDDAP clamp the range to the axis maximum
so a lookback that reaches past the latest available day is not an error.

**Empty ≠ error.** A spot with an all-cloud lookback yields a null observation,
not a thrown `not_found`: the spot is valid, the satellite just has not seen it.
Upstream HTTP/network failures still throw (so stale-if-error applies); an ERDDAP
`404 no matching results` is treated as "no observation".

**Window.** `clarityWindow(now)` is day-quantized (end = next UTC midnight,
start = 10 days earlier) so the `provider:spotId:window` cache key is stable
within a UTC day while the ~24 h TTL matches the product's cadence.

### Payload (`docs/api-contracts.md` → `/clarity`)

```ts
interface ClarityObservation {
  spotId: string;
  observedAt: string | null; // satellite day, ISO-8601 UTC, or null
  kd490: number | null; // m⁻¹, observed
  secchiDepthM: number | null; // derived (ZSD ≈ 1.44/Kd490)
  rating: "poor" | "fair" | "good" | "excellent" | null;
  pixel: { lat: number; lon: number } | null; // nearest 4 km cell read
}
```

The route returns `DataEnvelope<{ clarity: ClarityObservation }>`. `asOf` is the
satellite day when a pixel is available (so "Updated X ago" is honest about the
2–3 day latency); with no observation the adapter floors `asOf` at the window end
(the latest instant searched). Derivation reuses `lib/derive/clarity` — the
adapter never re-implements the band thresholds.

Clarity is **not** merged into `/current`: a 2–3 day old value does not belong in
a "now" snapshot. The frontend joins it on the detail page.

## Files

```
apps/web/fixtures/coastwatch/nesdisVHNkd490Daily.lajolla.range.2026-10-01..latest.json
apps/web/src/lib/providers/coastwatch.ts        # url, parse, source, adapter
apps/web/src/lib/providers/coastwatch.spec.ts
apps/web/src/lib/providers/registry.ts          # register adapter + getSpotClarity
apps/web/src/lib/providers/index.ts             # re-exports
apps/web/src/routes/api/spot/[id]/clarity/+server.ts
```

## Out of scope

- Merging clarity into `/current` (kept as its own observed endpoint).
- The `/api/spots` list `current` snapshot that carries the clarity band.
- Copernicus GlobColour gap-free ZSD (optional future supplement).
- Nearest land-free-pixel search / multi-pixel averaging; retry/backoff and
  pre-warm cron (deferred resilience).

## Verification

1. `pnpm --filter web test` — URL builder, griddap parse (null/`NaN` cloud rows,
   newest-non-null selection, malformed JSON), source caching/error paths, the
   adapter's empty-lookback degrade, and `getSpotClarity` through the service.
2. `pnpm lint && pnpm check && pnpm build` green.
3. Live smoke (manual):
   `curl -s localhost:5173/api/spot/la-jolla-shores/clarity` returns `ok: true`
   with `data.clarity.rating` and an `observedAt` a few days old.

---

## Outcome

Shipped as planned.

- `lib/providers/coastwatch.ts` — `COASTWATCH_PROVIDER_ID`/TTLs,
  `clarityWindow`, `buildCoastwatchKd490Url`, `parseCoastwatchKd490`,
  `createCoastwatchSource`, `toClarityObservation`, `createCoastwatchAdapter`.
- `lib/providers/registry.ts` — registers the adapter + `getSpotClarity`.
- `src/routes/api/spot/[id]/clarity/+server.ts` — `GET` with `404`/`502` mapping.
- Fixture: `fixtures/coastwatch/nesdisVHNkd490Daily.lajolla.range.2026-10-01..latest.json`
  (8 real daily rows including a 2026-10-07 cloud gap).
- Docs: `data-sources.md` (griddap `1:last` range + 12:00Z composite),
  `api-contracts.md` (`/clarity` payload), `README.md` (status + reading order),
  `milestones.md`, `todo-list.md`, `fixtures/README.md`.

Live smoke (2026-10-11): La Jolla Shores → `kd490 0.02625`, Secchi `54.86 m`,
`excellent`, pixel 32.869/-117.394, `observedAt 2026-10-08T12:00:00Z`; Catalina →
`kd490 0.0505`, `excellent`. Unknown spot → `404`.

Deviations worth flagging:

- **Sample point is `offshoreModelPoint`, not the spot's shoreline lat/lon.** At
  4 km resolution the nearest-to-beach cell is often land/mixed; the in-water
  model point is the same point the wave forecast samples. The actual pixel is
  echoed on the payload so it is never implied to be the beach.
- **All-cloud lookback is `200` with a null observation, not `404`.** The spot is
  valid; the satellite just has not seen it. Only an unknown spot is `404`.
- **`asOf` falls back to the window end when unobserved** (the latest instant
  searched) rather than the window start used by the multi-source observation
  adapters, so a cloudy spot never reads as older than the search itself.
- **Clarity stays out of `/current`.** Its 2-3 day latency has no place in a "now"
  snapshot; the frontend joins it on the detail page.
