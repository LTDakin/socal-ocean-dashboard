# API Contracts

Contracts between backend (SvelteKit server routes) and frontend. **Source of
truth** — frontend components and backend adapters should only speak these
shapes. Units are SI (metric) internally; display conversion is the frontend's
job. All responses use one envelope:

```jsonc
{
  "ok": true,
  "spotId": "scripps",
  "asOf": "2026-10-10T18:00:00Z",     // when this bundle was produced
  "stale": false,                       // true if served from stale cache
  "sources": [                          // provenance per provider
    { "provider": "gfswave", "modelRun": "2026-10-10T00:00:00Z", "fetchedAt": "..." },
    { "provider": "coops", "stationId": "9410230", ... }
  ],
  "data": { /* per-endpoint payload */ }
}
```

Errors use HTTP status + `{ "ok": false, "error": { "code", "message", "retryable" } }`.

## Endpoints

### `GET /api/spots`
List of curated spots (see `data-sources.md` spot model), with a lightweight
`current` snapshot for list rendering (wave height, water temp, tide state; the
clarity band joins it once `/clarity` exists) so the dashboard renders without
N+1 detail calls.

### `GET /api/spot/[id]/current`
The merged real-time observation snapshot. `data.current`:
`{ spotId, observedAt, waveHeightM, wavePeriodS, waveDirDeg, waterTempC,
windSpeedMs, windDirDeg, waterLevelM (MLLW), tideState: "rising" | "falling" |
"steady" | null, fields }`, where every non-null field has a provenance entry:

```jsonc
"fields": {
  "waveHeightM": { "provider": "cdip", "stationId": "201",
                   "observedAt": "2026-10-11T17:30:00Z", "ageSeconds": 3600 },
  "windSpeedMs": { "provider": "coops-obs", "stationId": "9410230", ... }
}
```

Merge rules: waves prefer the newest reading, CDIP first then its NDBC twin; a
null sub-field (e.g. `waveDp`) is filled independently; water temp takes the buoy
reading when the twin reports, else the shore sensor; wind takes the newest
reading with speed *and* direction from one station; water level/tide state come
from CO-OPS observations (tide state from the water-level rate, not from
`/tides`). `observedAt` is the newest field's observation time. A spot with no
usable observation is `404` `not_found`. Clarity is **not** merged here: it lags
by 2-3 days and belongs to `/clarity`.

### `GET /api/spot/[id]/forecast`
The core product. Both series for the full ~14-16 day window:

- `hourly[]`: time, significant wave height, mean & peak period, mean
  direction, wind-wave height/period/direction, swell height/period/direction,
  water temp, ocean current velocity/direction, wind speed/direction.
- `daily[]`: per-day aggregations (max wave height, dominant direction, max
  peak period / swell components), plus derived `surfScore` (0-10) and
  `bestTimeWindow`.

### `GET /api/spot/[id]/tides`
CO-OPS predictions for the spot's tide station over the same window. `data.coops`
is `{ spotId, stationId, datum: "MLLW", units: "metric", window, generatedAt,
predictions[] }` where each prediction is `{ time, highLow: "high" | "low" | null,
heightM }` — the hourly MLLW curve (`highLow: null`) merged with the exact
high/low events. Rendered as a tide curve. `asOf` is the payload generation time:
predictions are astronomical and carry no upstream model run.

### `GET /api/spot/[id]/clarity`
Latest clarity observation: `asOf, kd490, secchiDepth (m), rating` where
`rating` is one of `poor | fair | good | excellent` (derivation in
`apps/web/src/lib/derive`). Explicitly annotated **observed, not forecast**.

## Derived metrics (backend `lib/derive`)

- **Surf score** (0-10): weighted function of swell height, period, direction
  relative to spot exposure, tide, and local wind. Deterministic, units-tested,
  config respected but clearly labeled experimental in v1.
- **Visibility rating:** Secchi depth bands as above.
- **Daily aggregations**: max/dominant per day for wave & swell components.

## Data freshness policy

- Detail endpoints return `stale: true` + `asOf` when serving cached-but-old
  data (upstream failure) — the frontend shows "Updated X ago" from `asOf`.
- A `generatedAt` field on forecast tells the UI exactly which model run drove
  the values (good for trust: surfers care about the run the numbers came from).