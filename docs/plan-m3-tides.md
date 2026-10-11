# Plan — M3 (part 1): CO-OPS tides service

**Priority item:** `todo-list.md` → Priority 2, first bullet ("Build the tides
service"). Maps to the first half of `milestones.md` **M3**.

**Status:** ✅ implemented — CO-OPS tide-prediction adapter + `GET
/api/spot/[id]/tides`; fixture-backed, offline tests. `pnpm --filter web
test/lint/check` and `pnpm build` green.

## Problem

The wave forecast is live, but the dashboard promises a tide curve per spot
(`docs/api-contracts.md` → `GET /api/spot/[id]/tides`). CO-OPS publishes
deterministic harmonic **tide predictions** (MLLW) per station, and every seed
spot already carries a `coopsStationId` (`docs/data-sources.md`). Nothing fetches
them yet, and there is no `/tides` route. This item adds the adapter, the
contract-shaped payload, and the endpoint.

## Definition of done (from the todo list)

> an MLLW curve renders for a spot.

Concretely: the `/tides` route returns an envelope whose `data.coops.predictions`
is a complete MLLW series over the requested window (hourly curve plus high/low
flags), and a fixture-backed test proves the shape deterministically (no live
network in CI, `AGENTS.md` rule 8).

## Design

### Payload (`docs/api-contracts.md` → `/tides`)

The contract asks for `time, high/low flag, height` (MLLW). CO-OPS splits the two
things we need across two `interval`s — `h` (hourly curve) and `hilo` (the sole
high/low events) — so the adapter makes both cheap calls and **merges them into
one sorted series**:

```ts
interface TidePrediction {
  time: string;                    // ISO-8601 UTC
  heightM: number;                 // relative to MLLW
  highLow: 'high' | 'low' | null;  // set on the exact events, else null
}
interface CoopsTides {
  spotId: string;
  stationId: string;
  datum: 'MLLW';
  units: 'metric';
  window: ForecastWindow;
  generatedAt: string;
  predictions: TidePrediction[];
}
```

`asOf` is the payload generation time: tide predictions are astronomical and
carry no upstream production timestamp, so there is no model run to point at.
(Noted in code; the envelope's `asOf`/`stale` semantics are unchanged.)

### Source (`lib/providers/coops.ts`)

```ts
interface CoopsSource {
  getPredictions(stationId, window, interval: 'h' | 'hilo'): Promise<RawTidePrediction[]>
}
createCoopsSource({ fetchImpl?, cache?, cacheTtlMs? })
```

- `buildCoopsPredictionsUrl({ stationId, window, interval? })` — the Data API
  `datagetter` URL with `begin_date`/`end_date` (the confirmed multi-day range,
  see `data-sources.md`), `product=predictions`, `datum=MLLW`, `units=metric`,
  `time_zone=gmt`, `format=json`.
- `parseCoopsTime('2026-10-11 04:55')` → `2026-10-11T04:55:00.000Z` (GMT in the
  response).
- `buildTidePredictions(hourly, extremes, window)` — normalize, merge by
  timestamp (extremes win the flag), sort, and clip to `[window.start,
  window.end]`.
- Raw rows are cached by full URL, so spots sharing a station (the Orange County
  cluster all use `9410580`) share one upstream fetch per window.

### Adapter + registry + route

- `createCoopsAdapter()` → `ProviderAdapter<CoopsTides>`: `id: 'coops'`, TTL
  `6 h` / stale grace `48 h` (`docs/data-sources.md`). A spot with no
  `coopsStationId` throws `not_found`; an empty prediction set throws
  `not_found` too (never a silently empty curve).
- `lib/providers/registry.ts` registers the adapter and exposes
  `getSpotTides(spot, { window? })` (reusing `defaultForecastWindow`).
- `src/routes/api/spot/[id]/tides/+server.ts` — `GET`, `200` envelope or
  `{ ok: false }` with `404` (unknown spot / no station) / `502` (upstream).

## Files

```
apps/web/fixtures/coops/predictions.9410230.2026-10-11..2026-10-13.hourly.json
apps/web/fixtures/coops/predictions.9410230.2026-10-11..2026-10-13.hilo.json
apps/web/src/lib/providers/coops.ts          # url, parse, merge, source, adapter
apps/web/src/lib/providers/coops.spec.ts     # fixtures + fake source/network
apps/web/src/lib/providers/registry.ts       # register adapter + getSpotTides
apps/web/src/lib/providers/index.ts          # re-exports
apps/web/src/routes/api/spot/[id]/tides/+server.ts
```

## Out of scope

- **Water-level observations** (`product=water_level`) — real-time, not
  predicted; they belong to the `/current` observations service (next todo).
- **Currents** (`product=currents`, separate station id space) — link per spot
  when the observations adapter lands.
- **Station metadata** (name/lat/lon) — the predictions response doesn't include
  it; a name label can come from a later mdapi call if the UI needs it.
- Retry/backoff, pre-warm cron, telemetry — deferred resilience.

## Verification

1. `pnpm --filter web test` — URL/params, time parsing, fixture merge
   (sorted, flagged extremes, window clipping), adapter provenance +
   cache-through, and the `not_found` paths.
2. `pnpm lint && pnpm check && pnpm build` green.
3. Live smoke (manual): `curl -s localhost:5173/api/spot/la-jolla-shores/tides`
   returns `ok: true` with a ~14-day MLLW `predictions[]`.

---

## Outcome

Shipped as planned.

- `lib/providers/coops.ts` — `COOPS_PROVIDER_ID`/TTLs, `buildCoopsPredictionsUrl`,
  `parseCoopsTime`, `buildTidePredictions`, `createCoopsSource`,
  `createCoopsAdapter`.
- `lib/providers/coops.spec.ts` — URL, time parsing, fixture merge + clipping,
  source URL/cache-through, adapter provenance + cache-through, missing-station
  and empty-set `not_found`, error-body handling.
- `lib/providers/registry.ts` — registers `coopsAdapter`, adds `getSpotTides` +
  `TidesEnvelope`.
- `lib/providers/index.ts` — re-exports the CO-OPS surface.
- `src/routes/api/spot/[id]/tides/+server.ts` — `GET` with `404`/`502` mapping.
- Fixtures: a 3-day hourly + hilo range for station `9410230` (La Jolla).
- Docs: `data-sources.md` (range query confirmed), `api-contracts.md` (payload
  shape), `README.md` (status + reading order), `milestones.md`, `todo-list.md`.

Deviations worth flagging:

- **One merged series.** The contract names a single `time, high/low flag,
  height` shape; CO-OPS gives hourly and high/low on separate `interval`s, so the
  adapter merges them (extremes carry the flag; hourly points are `null`).
- **`asOf` = generation time.** Predictions have no upstream production
  timestamp. Documented in `coops.ts`.
- **Window clipping in the adapter** even though the API range already clips, so
  a station/window mismatch can never leak out-of-window points.

**Verification run (all green):** `pnpm --filter web test` ✅ (71 tests, 14 new
CO-OPS) · `pnpm --filter web check` ✅ (0 errors, 0 warnings) ·
`pnpm --filter web lint` ✅ · `pnpm build` ✅. **Live smoke** ✅ —
`GET /api/spot/la-jolla-shores/tides` returned 387 MLLW points over 14 days
(station `9410230`) with 50 high/low flags merged in.
