# Plan — M2 (part 1): GFS-Wave provider + forecast endpoint

**Priority item:** `todo-list.md` → Priority 1, second bullet ("Build the
GFS-Wave provider + forecast service"). Maps to the first half of
`milestones.md` **M2**; the `lib/derive` half (surf score, ratings) is the next
todo.

**Status:** ✅ implemented — GFS-Wave adapter + region source + `/forecast`
endpoint, with daily aggregation in `lib/derive`; live-verified against NOMADS.
`pnpm --filter web test/lint/check` and `pnpm build` green.

## Problem

`lib/grib2` can decode NOMADS fields, but nothing turns them into the forecast
the product is about. The adapter seam (`lib/providers`) exists but only the stub
is registered, and there is no `/api` route yet. This item closes the loop:
GFS-Wave fields → the `hourly[]`/`daily[]` contract → `GET
/api/spot/[id]/forecast` with provenance, TTL cache, and stale-if-error.

## Definition of done (from the todo list)

> one live SoCal spot returns a full ~14-day forecast through the BFF.

Plus a deterministic, fixture-backed contract test (no live network in CI,
`AGENTS.md` rule 8).

## Design

### Region source (`lib/providers/gfswave.ts`)

One GFS-Wave field is one GRIB file per forecast hour, so the adapter needs
per-hour fetches. To keep them cheap and shareable across spots it fetches a
**single SoCal region subset per (cycle, hour)** — all needed variables, one
small box covering every seed spot — and caches the decoded fields in-process.

```ts
interface GfsWaveSource {
  getHourlyFields(cycle: Date, hour: number): Promise<GribField[]>;
}
createNomadsSource({ region?, variables?, fetchImpl?, cache? })  // real: lib/grib2 fetch
```

The box is written in NOMADS' native `[0,360)` longitudes (`toNomadsLongitude`).

### Pure forecast builder

`sampleWavePoint(fields, lat, lon)` → one `WaveHourlyPoint` (SI):

`waveHeightM, dominantPeriodS, dominantDirectionDeg` (HTSGW/PERPW/DIRPW);
`windWaveHeightM/PeriodS/DirectionDeg` (WVHGT/WVPER/WVDIR); dominant
`swellHeightM/PeriodS/DirectionDeg` plus all three `swellPartitions`
(SWELL/SWPER/SWDIR 1–3); `windSpeedMs` (WIND) and `windDirectionDeg` (WDIR, or
computed from UGRD/VGRD when absent). Missing fields sample to `null`.

`buildGfsWaveForecast({ spot, cycle, hours, fieldsByHour, generatedAt })` →
`{ spot, modelRun, generatedAt, window, hourly[], daily[] }`. Model cadence is
respected when planning hours: **hourly to +120 h, then 3-hourly to +384 h**,
clipped to the requested window.

### Cycle selection

`latestModelCycle(now, { latencyHours = 4 })` → the newest 00/06/12/18Z run that
is at least `latencyHours` old (GFS publishes a few hours after the cycle).
`defaultForecastWindow(now, { days = 14 })` → `now` floored to the hour through
`now + 14 d`.

### Daily aggregation (`lib/derive/daily.ts`)

`aggregateDaily(points)` groups the hourly series by UTC date and takes the
per-day extremes (max wave height, its dominant direction, max dominant period,
max swell height/period + direction). Deterministic and units-tested — the same
shape the surf-score work will consume next. (This is the "daily aggregations"
slice of the `lib/derive` todo; surf score + ratings remain.)

### Adapter + registry + route

- `createGfsWaveAdapter()` → `ProviderAdapter<GfsWaveForecast>`: `id: 'gfswave'`,
  TTL `1 h` / stale grace `6 h` (per `docs/data-sources.md`), bounded-concurrency
  hour fan-out (`Promise` pool), provenance `asOf = modelRun = cycle`.
- `lib/providers/registry.ts` wires the adapter onto the shared `providerCache`
  and exposes `getSpotForecast(spot, { window? })`.
- `src/routes/api/spot/[id]/forecast/+server.ts` — `GET`, `200` envelope or
  `{ ok: false }` with `404` (unknown spot) / `502` (upstream), per
  `docs/api-contracts.md`.

## Files

```
apps/web/src/lib/providers/gfswave.ts        # types, source, builder, adapter
apps/web/src/lib/providers/gfswave.spec.ts   # fixtures + fake source/network
apps/web/src/lib/providers/registry.ts       # shared-cache wiring + getSpotForecast
apps/web/src/lib/derive/daily.ts             # daily aggregation
apps/web/src/lib/derive/daily.spec.ts
apps/web/src/routes/api/spot/[id]/forecast/+server.ts
```

## Out of scope

- Surf score, visibility ratings, `lib/derive` score bands — next todo.
- Water temp / currents on the hourly contract — not GFS-Wave fields; they come
  from CO-OPS/CDIP adapters later (M3).
- Region-sharing pre-warm cron, retry/backoff, telemetry — deferred resilience.
- Live-network CI; contract tests replay fixtures through an injected source.

## Verification

1. `pnpm --filter web test` → cycle math, hour planning, fixture sampling,
   daily aggregation, adapter provenance, and source cache-through.
2. `pnpm lint && pnpm check && pnpm build` green.
3. Live smoke (manual): `curl -s localhost:5173/api/spot/la-jolla-shores/forecast`
   returns `ok: true` with ~14 days of hourly/daily points and `sources[0].modelRun`.

---

## Outcome

Shipped as planned. New/changed files:

- `lib/providers/gfswave.ts` — `latestModelCycle`, `selectForecastHours`,
  `defaultForecastWindow`, `createNomadsSource` (region subset, per-(cycle,hour)
  cache), `sampleWavePoint`, `buildGfsWaveForecast`, `createGfsWaveAdapter`.
- `lib/providers/gfswave.spec.ts` — cycle math, hour planning, fixture sampling,
  builder, adapter provenance + cache-through, source URL/cache, horizon
  `not_found`.
- `lib/providers/registry.ts` — `providerCache`, the registered adapter,
  `spotDataService`, `getSpotForecast`.
- `lib/derive/daily.ts` (+ spec) — `aggregateDaily`.
- `src/routes/api/spot/[id]/forecast/+server.ts` — `GET` with `404`/`502` mapping.
- `lib/grib2/fetch.ts` — levels are now opt-in (`levels?`); the default omits
  `lev_*` so sequence-level swell partitions are returned.

Notable findings from the live smoke test (2026-10-11 00Z cycle):

- The Grib Filter **rejects nothing** for the signed→`[0,360)` region box; a
  `wcoast.0p16` subset for 32–34.9°N / 120.4–116.8°W decodes to HTSGW = 0.95 m at
  La Jolla, matching the committed fixture.
- `lev_surface=on` **drops the swell partitions** (they live at `N in sequence`),
  which is why levels became opt-in. With levels omitted the subset returns all
  three partitions plus WVHGT/WVPER/WVDIR.

Deviations worth flagging:

- **`lib/derive`'s "daily aggregations" slice landed here** (it is required by
  the forecast contract's `daily[]`); surf score + visibility ratings remain the
  next todo.
- **`lib/derive/daily.ts`** is generic over a `DailyWavePoint` input so the
  surf-score work can reuse it without importing the adapter.
- **Snapshot gap:** the contract lists water temp and currents on `hourly[]`, but
  GFS-Wave has neither; they arrive from CO-OPS/CDIP in M3. The adapter emits the
  wave/wind fields it actually owns and the endpoint passes them through.
- **Route imports are relative**, not `#lib/*`: the generated `$app/tsconfig`
  ships empty `paths`, so bare `#lib`/`$lib` specifiers don't type-check in route
  `.ts` files. Worth fixing before the frontend milestone.

**Verification run (all green):** `pnpm --filter web test` ✅ (40 tests) ·
`pnpm --filter web check` ✅ (0 errors, 0 warnings) · `pnpm --filter web lint` ✅ ·
`pnpm build` ✅. **Live smoke** ✅ — a 6 h window returned 7 real hours
(HTSGW 0.95 m, PERWP 17.64 s, 3 swell partitions) and a correct daily aggregate
(throwaway spec deleted; CI stays offline).
