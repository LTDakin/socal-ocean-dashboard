# Plan — M3 (part 2): real-time observations service (`/current`)

**Priority item:** `todo-list.md` → Priority 2, second bullet ("Build the
real-time observations service"). Maps to the second half of `milestones.md`
**M3** and the `/api/spot/[id]/current` contract.

**Status:** ✅ implemented — CDIP buoy-obs + NDBC gap-fill + CO-OPS observation
adapters, merged into `GET /api/spot/[id]/current` with per-field provenance.
Fixture-backed, offline tests. `pnpm --filter web test/lint/check` and
`pnpm build` green.

## Problem

The wave forecast (`/forecast`) and the tide curve (`/tides`) are live, but
nothing yet answers "what is it doing _right now_". The dashboard's spot cards and
the detail page's conditions panel both want a genuine "now" snapshot
(`docs/api-contracts.md` → `/current`, `docs/frontend.md`). This item adds the
observation adapters and the `/current` endpoint that merges them with per-field
provenance.

## Definition of done (from the todo list)

> `current` returns genuine "now" values.

Concretely: `/api/spot/[id]/current` returns an envelope whose `data.current`
carries the freshest observed wave height/period/direction, water temperature,
wind, and water level/tide state, each tagged with the provider, station, and
observation time it came from — and a fixture-backed test proves the merge
deterministically (no live network in CI, `AGENTS.md` rule 8).

## Design

### Sources (adapters in `lib/providers`)

| Adapter id  | Upstream                                                         | Contributes                                | TTL / stale |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------ | ----------- |
| `cdip`      | CDIP ERDDAP `tabledap/wave_agg`                                  | wave Hs/Tp/Dp                              | 30 m / 6 h  |
| `ndbc`      | NDBC `realtime2/<station>.txt`                                   | wave Hs/DPD/MWD, SST, wind (gap-fill)      | 30 m / 6 h  |
| `coops-obs` | CO-OPS `datagetter` `water_level` / `water_temperature` / `wind` | water level + tide state, water temp, wind | 15 m / 6 h  |

All three follow the existing adapter contract (`ProviderAdapter<T>`) and are
registered against the process-wide `providerCache`.

**NDBC linkage is derived, not curated.** NDBC names its CDIP-partner buoys with
the CDIP station id in parentheses (`"SCRIPPS Nearshore, CA (201)"` →
station `46254`), so the adapter resolves the spot's existing `cdipBuoyId`
through a small twin table (`CDIP_NDBC_TWINS`) instead of adding a field to the
spot model. Spots whose buoy has no NDBC twin simply get no NDBC fallback.

**Observations degrade instead of failing.** A spot with no linked buoy, or a
buoy with no rows in the window, yields `observation: null` — not a thrown
`not_found`. `/current` still 404s only when _no_ field at all is available.
Upstream HTTP/network failures still throw (so stale-if-error applies).

**Window.** Observations are queried over an hour-quantized window
(`observationWindow()`: 3 h lookback, end rounded up to the next hour) so the
`provider:spotId:window` cache key is stable within an hour while the data stays
"now". Field freshness comes from each field's real `observedAt`, not the window.

### Payload (`docs/api-contracts.md` → `/current`)

```ts
interface FieldProvenance {
  provider: "cdip" | "ndbc" | "coops-obs";
  stationId: string;
  observedAt: string; // upstream observation time, ISO-8601 UTC
  ageSeconds: number; // now - observedAt
}
interface CurrentConditions {
  spotId: string;
  observedAt: string | null; // newest field observation
  waveHeightM: number | null;
  wavePeriodS: number | null; // peak (CDIP) / dominant (NDBC)
  waveDirDeg: number | null;
  waterTempC: number | null;
  windSpeedMs: number | null;
  windDirDeg: number | null;
  waterLevelM: number | null; // MLLW
  tideState: "rising" | "falling" | "steady" | null;
  fields: Partial<Record<CurrentField, FieldProvenance>>;
}
```

The route returns `DataEnvelope<{ current: CurrentConditions }>`; `asOf` stays the
newest source `asOf` from the shared orchestrator.

### Merge rules (`lib/providers/current.ts`)

Per field, the newest observation wins, with a fixed provider ordering in front of
it:

- **Waves** — candidates CDIP then NDBC; newest wins, so a lagging CDIP buoy is
  filled by its NDBC twin (and vice versa). Fields are chosen independently, so
  one null (e.g. missing `waveDp`) doesn't discard the rest.
- **Water temp** — the buoy (NDBC) when it reports, else the shore sensor
  (CO-OPS). Representativeness beats recency here, and the adapter window already
  guarantees every candidate is ≤3 h old.
- **Wind** — candidates NDBC then CO-OPS; newest wins (wind changes fast), and
  speed and direction always come from the same station (never mixed).
- **Water level / tide state** — `coops-obs` only. Tide state is the sign of the
  water-level rate over the window (`|rate| < 0.05 m/h` → `steady`).

## Files

```
apps/web/fixtures/cdip/wave_agg.station-201.recent.json      # last hours, station 201
apps/web/fixtures/ndbc/realtime2.46254.txt                   # Scripps Nearshore (CDIP 201 twin)
apps/web/fixtures/ndbc/realtime2.46225.txt                   # Torrey Pines Outer (CDIP 100 twin)
apps/web/fixtures/ndbc/activestations.socal.json             # SoCal buoy registry (twin evidence)
apps/web/fixtures/coops/water_level.9410230.2026-10-11T16Z..19Z.json
apps/web/fixtures/coops/wind.9410230.latest.json
apps/web/src/lib/providers/cdip.ts            # url, parse, source, adapter
apps/web/src/lib/providers/ndbc.ts            # twin table, realtime2 parse, source, adapter
apps/web/src/lib/providers/coops-obs.ts       # observation urls, trend, source, adapter
apps/web/src/lib/providers/current.ts         # observationWindow + merge + per-field provenance
apps/web/src/lib/providers/cdip.spec.ts
apps/web/src/lib/providers/ndbc.spec.ts
apps/web/src/lib/providers/coops-obs.spec.ts
apps/web/src/lib/providers/current.spec.ts
apps/web/src/lib/providers/registry.ts        # register adapters + getSpotCurrent
apps/web/src/lib/providers/index.ts           # re-exports
apps/web/src/routes/api/spot/[id]/current/+server.ts
```

## Out of scope

- **Clarity** in `/current`. Clarity is an _observed, 2-3 days old_ value and has
  its own endpoint (`/clarity`, the next todo). `buildCurrentConditions` will
  take it as an optional input when that adapter lands; the merge here ignores it.
- **Next high/low tide event** — the tide curve already provides them via
  `/tides`; `/current` carries only the instantaneous water level + trend.
- **Nearest-station search** for buoys (only exact NDBC twins are used), CDIP
  `sst_agg`/`cat4_agg`, CO-OPS currents, and station metadata lookups.
- Retry/backoff, pre-warm cron, telemetry — deferred resilience.

## Verification

1. `pnpm --filter web test` — URL/params for each source, ERDDAP/realtime2/CO-OPS
   parsing (including `MM`/null handling), trend math, adapter degrade paths, the
   CDIP-vs-NDBC merge precedence, per-field provenance, and `not_found` when no
   source has data.
2. `pnpm lint && pnpm check && pnpm build` green.
3. Live smoke (manual):
   `curl -s localhost:5173/api/spot/la-jolla-shores/current` returns `ok: true`
   with a `data.current` whose wave fields are minutes-to-hours old and whose
   `fields` name the provider/station behind each value.

---

## Outcome

Shipped as planned.

- `lib/providers/cdip.ts` — `CDIP_PROVIDER_ID`/TTLs, `buildCdipWaveUrl`,
  `parseCdipWave`, `createCdipSource`, `createCdipAdapter`.
- `lib/providers/ndbc.ts` — `NDBC_PROVIDER_ID`/TTLs,
  `CDIP_NDBC_TWINS`/`ndbcTwinForCdipBuoy`, `parseNdbcRealtime2`,
  `createNdbcSource`, `createNdbcAdapter`.
- `lib/providers/coops-obs.ts` — `COOPS_OBS_PROVIDER_ID`/TTLs,
  `buildCoopsObservationUrl`, `buildCoopsObservations`, `createCoopsObsSource`,
  `createCoopsObsAdapter`.
- `lib/providers/current.ts` — `observationWindow`,
  `buildCurrentConditions`, `CurrentConditions`/`FieldProvenance` types.
- `lib/providers/registry.ts` — registers the three adapters + `getSpotCurrent`.
- `src/routes/api/spot/[id]/current/+server.ts` — `GET` with `404`/`502` mapping.
- Fixtures: recent CDIP window, two NDBC realtime2 files, the SoCal NDBC
  registry, and CO-OPS water-level/wind snapshots.
- Docs: `data-sources.md` (NDBC endpoints confirmed + twin convention),
  `api-contracts.md` (`/current` payload), `README.md` (status + reading order),
  `milestones.md`, `todo-list.md`, `fixtures/README.md`.

Deviations worth flagging:

- **NDBC gap-fill is twin-only.** Only 6 of the 19 seed spots have an NDBC twin
  (the shared CDIP/NDBC buoys); the rest are CDIP-only. No nearest-station
  guessing, so a field is never attributed to a buoy at a different location.
- **Clarity is not in `/current` yet.** Clarity is an observation with days of
  latency and belongs to its own endpoint; `buildCurrentConditions` leaves the
  seam for it (`docs/api-contracts.md` updated accordingly).
- **Empty ≠ error.** Unlinked/dead buoys produce `current: null` fields with the
  spot's other fields intact; only a fully empty result is `not_found`.
- **Tide state is observed, not predicted.** It comes from the water-level rate
  (last reading vs. the window's first), not from `/tides` predictions.
