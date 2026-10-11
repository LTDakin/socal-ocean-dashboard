# Data Sources

All primary sources are US-government public domain (no keys, no usage
restrictions). Every source is behind a provider adapter. Specifics below are the
working reference for each adapter; exact URLs and dataset IDs are confirmed
lazily as each adapter is built — there is no separate audit gate.

## Primary providers

| Source | What we get | Cadence | Backend TTL | Access / notes |
|---|---|---|---|---|
| **NOMADS GFS-Wave (WW3)** | Global wave forecast: sig. wave height, period, direction; wind-wave & swell split | Model runs ~6-hourly; hourly fields to +120h, coarser beyond; **16-day horizon** | ~1 h | GRIB2 via Grib Filter (OPeNDAP being deprecated). Subset by region + variables server-side. Parsed via `@mattnucc/gribberish`. |
| **CDIP (Scripps)** | Nearshore so-Cal wave model + real-time buoy obs | Buoys: 30 min; model nowcast hourly, ~4-6 day ECMWF swell forecast | obs 30 m, model 1-6 h | CA-focused (~0.01°, alongshore points ~100 m). Best-in-class accuracy for surf spots. THREDDS/netCDF + IOOS ERDDAP JSON mirror for buoy obs. |
| **NOAA CO-OPS** | Tide predictions + water levels, currents, water/air temp | Predictions: annual (constant); observations ~6 min | ~6 h | Free JSON API (`api.tidesandcurrents.noaa.gov`), CORS-enabled. Station IDs per spot (e.g., LA/LB area). |
| **NDBC** | Offshore buoy real-time obs (waves, SST, wind, pressure) | ~10 min-1 h | ~30 m | Plain-text + ERDDAP mirrors. Cross-check / gap-fill for CDIP. |
| **NOAA CoastWatch ERDDAP (VIIRS)** | Satellite **Kd490** (water clarity proxy) | Daily (science quality has ~15-day latency; NRT product preferred) | ~24 h | griddap JSON/NetCDF. Cloud gaps → missing values; note latency in UI. |

## Visibility / clarity (important caveats)

- There is **no forecast** for underwater visibility. We show the latest
  satellite-derived clarity (observed, 1-2 days behind) and label it as such.
- Derivation: Kd490 → Secchi depth via `ZSD ≈ 1.44 / Kd490` (Kirk), mapped to
  a rating band (e.g., <5 m poor … >20 m excellent). Neat-appearing thresholds
  live in `apps/web/src/lib/derive`.
- Optional future supplement: **Copernicus GlobColour** (CMEMS) provides daily
  gap-free Secchi depth (ZSD) directly at ~1 km, free including commercial use
  (requires a free account token — so backend-only). Add behind an adapter;
  not required for v1.

## Open-Meteo Marine API

- **Dev/fallback only.** Free tier is non-commercial (CC-BY attribution; use
  only as a cross-check and dev convenience). The commercial product would be
  a paid subscription. We use NOAA primary so monetization is never blocked.
- Useful in dev as a sanity check while the GRIB2 path matures.

## Spot data model

A curated list (v1: ~10-20 SoCal spots spanning surf / dive / boat use cases).
Each spot:

```
{
  id, name, region, lat, lon,
  types: ["surf" | "dive" | "boat"],
  offshoreModelPoint: { lat, lon },     // deep-water GFS-Wave sample point
  cdipBuoyId?,                          // for nearest-buoy conditions
  coopsStationId?,                      // for tides/water level
  exposureDeg?: number,                 // spot heading, for surf score
  favoriteSeed?: boolean
}
```

## Provider endpoints (confirmed 2026-10-11)

Verified live against each upstream. Frozen samples for every one are committed
under [`apps/web/fixtures/`](../apps/web/fixtures/README.md) (with the exact
queries used), so tests and dev never hit the live APIs.

### NOMADS GFS-Wave (WW3)

- **Grib Filter:** `https://nomads.ncep.noaa.gov/cgi-bin/filter_gfswave.pl`
  - `dir=/gfs.YYYYMMDD/HH/wave/gridded` (e.g. `/gfs.20261011/00/wave/gridded`)
  - `file=gfswave.tHHz.<domain>.<grid>.fFFF.grib2`
  - Variables via `var_<ABBREV>=on`, levels via `lev_*`; **server-side
    subregion needs `subregion=`** plus `toplat/bottomlat/leftlon/rightlon`.
- **Direct files (for `.idx` Range fetches):**
  `https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.YYYYMMDD/HH/wave/gridded/gfswave.tHHz.<domain>.<grid>.fFFF.grib2`
  (+ a wgrib2-style `.idx` sidecar).
- **Domains:** `global.0p25`, `global.0p16`, `wcoast.0p16`, `epacif.0p16`,
  `atlocn.0p16`, `gsouth.0p25`, `arctic.9km`. **Use `wcoast.0p16` for SoCal**
  (West Coast, 0.16°; coverage 25–50°N, 150–110°W).
- **Forecast hours:** `f000–f120` hourly, then **3-hourly `f123–f384`** (16-day
  horizon); 209 files per domain/cycle.
- **Fields (wcoast):** `HTSGW, PERPW, DIRPW` (combined); `WVHGT, WVPER, WVDIR`
  (wind-wave); `SWELL{1,2,3}, SWPER{1,2,3}, SWDIR{1,2,3}` (swell partition);
  `WIND, WDIR, UGRD, VGRD`.
- **Packing (for the codec):** full files use **Data Representation Template 40
  (JPEG2000)**; Grib Filter subsets are re-packed to **template 0 (simple
  packing)**. Both decode cleanly with `@mattnucc/gribberish`.
- **Sanity check:** `00Z f000 HTSGW` at La Jolla = 0.95 m; nearby CDIP buoy 201
  reported `waveHs` 0.75 m at 07Z — same regime.

### CDIP (Scripps)

- **Buoy obs (ERDDAP, tabledap):** `https://erddap.cdip.ucsd.edu/erddap/`
  - Dataset `wave_agg` (also `sst_agg`, `cat4_agg`, `gps_agg`, `acm_agg`).
    There are **no per-station `edu_ucsd_cdip_<id>` datasets** on this ERDDAP.
  - Query:
    `tabledap/wave_agg.json?time,waveHs,waveTp,waveDp&station_id="201"&time>=YYYY-MM-DDTHH:MM:SSZ`
  - Station registry:
    `tabledap/wave_agg.json?station_id,metaStationName,latitude,longitude&distinct()`
  - Confirmed SoCal stations: **`073`** Scripps Pier, **`201`** Scripps
    Nearshore, **`100`** Torrey Pines Outer (full list in the fixture).
- **Nearshore MOP model (THREDDS):**
  `https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/model/MOP_grids/CA_0.01_nowcast.nc`
  — 0.01° CA grid, vars `waveHs, waveTp, waveTa, waveDp` (with `CA_0.01_forecast.nc`
  and `*_seaswellfc.nc` for the forecast horizon; NCSS subsetting at
  `/thredds/ncss/grid/…` and `/thredds/ncss/point/…`).

### NOAA CoastWatch (VIIRS Kd490)

- **ERDDAP:** `https://coastwatch.pfeg.noaa.gov/erddap/`
- **Dataset:** `nesdisVHNkd490Daily` — VIIRS (S-NPP) NRT Kd490, global 4 km
  (0.0375°), Level-3 daily, 2017–present. (Lon0360 variant:
  `nesdisVHNkd490DailyLon0360`.)
- **Subset:** `griddap/nesdisVHNkd490Daily.json?kd_490[(DATE)][(0.0)][(lat)][(lon)]`
  — variable `kd_490` (m⁻¹).
- **Latency:** observed ~2–3 days behind (aggregation max `2026-10-08T12:00Z`
  on 2026-10-11). Cloud gaps → missing/NaN values.
- Example: La Jolla 2026-10-08 = 0.03424 m⁻¹ → Secchi ≈ 42 m.

### NOAA CO-OPS

- **Data API:** `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter`
- **Metadata API:** `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json`
- **No token required** for v1 calls (verified for predictions and
  water_temperature). `date=today|recent|latest` covers single-day/latest
  windows; for an arbitrary range use `begin_date`/`end_date` (`YYYYMMDD`, up to
  1 year) — confirmed live for a 3-day hourly + `hilo` pull.
- **Station IDs (tide predictions + water level):** `9410230` La Jolla (Scripps
  Wharf); `9410170` San Diego (Broadway); `9410196` Mission Bay; `9410580`
  Newport Bay Entrance / Corona del Mar; `9410583` Balboa Pier; `9410660` LA
  Outer Harbor; `9410680` Long Beach (Terminal Island); `9410840` Santa Monica
  Pier; `9411065` Port Hueneme; `9411189` Ventura; `9411340` Santa Barbara;
  `9412110` Port San Luis.
- **Currents:** `product=currents` exists but uses a separate current-station ID
  space; link per spot when the observations adapter is built.

### NDBC

- To confirm when the observations adapter is built (plain-text `realtime2`
  files + ERDDAP mirrors).