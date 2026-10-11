# Data Sources

All primary sources are US-government public domain (no keys, no usage
restrictions). Every source is behind a provider adapter; specifics below are
"as designed at planning time" and the **Data Audit task** confirms exact URLs
and dataset IDs before coding.

## Primary providers

| Source | What we get | Cadence | Backend TTL | Access / notes |
|---|---|---|---|---|
| **NOMADS GFS-Wave (WW3)** | Global wave forecast: sig. wave height, period, direction; wind-wave & swell split | Model runs ~6-hourly; hourly fields to +120h, coarser beyond; **16-day horizon** | ~1 h | GRIB2 via Grib Filter (OPeNDAP being deprecated). Subset by region + variables server-side. Parsed by our `packages/grib2`. |
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

## Data Audit task (M1, before adapter coding)

Confirm and record exact values in this doc:
- NOMADS: exact Grib Filter URL template for `gfswave`, `dir=` path
  (`.../wave/gridded`?), file naming (`gfswave.t00z.0p25.fFFF.grib2`, the
  N. American 0.16° hourly domain coverage over CA), which data-
  representation template the files use (for the GRIB2 lib), and stride of
  forecast hours beyond +120h.
- CDIP: confirm IOOS ERDDAP dataset IDs for CA buoys (e.g.,
  `edu_ucsd_cdip_<id>`), and the practical route to MOP nearshore model output
  (netCDF via THREDDS, or CDIP's experimental API).
- CoastWatch: pick the NRT VIIRS Kd490 griddap dataset ID covering CA,
  resolution, latency, and missing-data behavior.
- CO-OPS: confirm station IDs and that no API token is needed for v1 calls.