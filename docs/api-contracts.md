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
List of curated spots (see `data-sources.md` spot model) with a lightweight
`current` snapshot for list rendering, so the dashboard renders without N+1
detail calls. `data.spots[]` merges the same services the detail endpoints use
(`/current`, `/clarity`, and a short `/tides` window) and flattens them:

```jsonc
{
  "id": "la-jolla-shores", "name": "La Jolla Shores", "region": "san-diego",
  "lat": 32.8572, "lon": -117.257, "types": ["surf", "dive"],
  "exposureDeg": 265, "favoriteSeed": true,
  "snapshot": {                     // every value SI, nullable when unobserved
    "waveHeightM": 2, "wavePeriodS": 7, "waveDirDeg": 268,
    "waterTempC": 21.4, "windSpeedMs": 6.8, "windDirDeg": 235,
    "waterLevelM": 1.848, "tideState": "falling",
    "clarityRating": "excellent"    // observed band (lags 2-3 days)
  },
  "observedAt": "2026-10-11T18:42:00Z",        // newest /current field, or null
  "clarityObservedAt": "2026-10-08T12:00:00Z", // satellite day, or null
  "tide": {                                     // null with no linked/fetched station
    "stationId": "9410230",
    "preview": [                                // next ~24 h: 3-hourly curve + every high/low
      { "time": "2026-10-11T23:27:00Z", "heightM": -0.02, "highLow": "low" }
    ]
  }
}
```

Per-spot upstream failures degrade that spot to nulls — the list is never `502`
just because one buoy is down. Provenance is collapsed to **one `sources[]`
entry per provider** (newest `asOf`, `stale` = any spot stale). The envelope has
no per-spot `spotId` (the list has no single subject), so it is the standard
envelope minus that field.

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
- `daily[]`: per-day aggregations — `{ date, maxWaveHeightM,
  dominantDirectionDeg, maxDominantPeriodS, maxSwellHeightM, swellPeriodS,
  swellDirectionDeg, sampleCount }` — plus the derived `surfScore` (0-10, the
  day's best hour, `null` when unscoreable) and `bestTimeWindow` (ISO instant of
  that hour). Both are computed by `lib/derive` (`scoreSurfByDay`).

### `GET /api/spot/[id]/tides`
CO-OPS predictions for the spot's tide station over the same window. `data.coops`
is `{ spotId, stationId, datum: "MLLW", units: "metric", window, generatedAt,
predictions[] }` where each prediction is `{ time, highLow: "high" | "low" | null,
heightM }` — the hourly MLLW curve (`highLow: null`) merged with the exact
high/low events. Rendered as a tide curve. `asOf` is the payload generation time:
predictions are astronomical and carry no upstream model run.

### `GET /api/spot/[id]/clarity`
The latest observed satellite clarity, explicitly annotated **observed, not
forecast** (the VIIRS product lags 2-3 days). `data.clarity`:

```jsonc
{
  "spotId": "la-jolla-shores",
  "observedAt": "2026-10-08T12:00:00Z", // satellite day, or null when all cloud
  "kd490": 0.02625,          // observed diffuse attenuation (m^-1)
  "secchiDepthM": 54.86,     // derived: ZSD ≈ 1.44 / Kd490
  "rating": "excellent",     // poor | fair | good | excellent | null
  "pixel": { "lat": 32.86875, "lon": -117.39375 } // 4 km cell read
}
```

Envelope `asOf` is the satellite day; a valid spot with no clear pixel is `200`
with a null observation, not an error.

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