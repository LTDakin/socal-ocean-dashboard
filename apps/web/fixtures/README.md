# Test fixtures

Real upstream samples committed so tests and local dev **never hit the live
APIs**. These are frozen snapshots; the values go stale, and that is fine — they
exist to exercise the codec, adapters, and contract tests deterministically.

Captured **2026-10-11** (UTC); the confirmed endpoints live in
[`docs/data-sources.md` → Provider endpoints](../../../docs/data-sources.md#provider-endpoints-confirmed-2026-10-11).
Provenance for every file is in the tables below.

## `nomads/` — GFS-Wave (WW3) GRIB2

Cycle `2026-10-11 00Z`, domain `wcoast.0p16` (West Coast, 0.16°), analysis hour
`f000`. See derivation of the URLs in `docs/data-sources.md`.

| File                                                            | Size    | What it is                                                                                                                                                                                |
| --------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gfswave.t00z.wcoast.0p16.f000.grib2.idx`                       | 828 B   | The wgrib2 `.idx` sidecar (19 field lines) — used to derive byte-Range fetches.                                                                                                           |
| `gfswave.t00z.wcoast.0p16.f000.HTSGW-full-field-jpeg2000.grib2` | 10.9 KB | A single full-grid field fetched by byte-Range (`bytes=71276-82194`), **packed as JPEG2000 (DRT 40)** — exercises the real NOMADS packing.                                                |
| `gfswave.t00z.wcoast.0p16.f000.socal-17field-subset.grib2`      | 3.2 KB  | Grib Filter server-side subset: La Jolla box (32.6–33.0°N, 117.5–117.0°W) × 17 fields, **re-packed by the filter as Simple packing (DRT 0)** — exercises the adapter's normal fetch path. |

The subset contains: `WIND, UGRD, VGRD, HTSGW, PERPW, DIRPW, WVPER, WVDIR,
SWELL{1,2,3}, SWPER{1,2,3}, SWDIR{1,2,3}`.

**Cross-check:** `HTSGW` at the La Jolla grid point (32.83°N, 117.33°W) decodes
to **0.95 m** in _both_ files. The nearest CDIP buoy (station 201, Scripps
Nearshore) reported `waveHs` **0.75 m** at 2026-10-11 07:00Z — same regime,
confirming the fixture is real and sane. The golden test for M1 should pin these
decode values (see `docs/milestones.md`).

## `cdip/` — CDIP buoy observations

| File                                                       | Source query                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `wave_agg.stations.json`                                   | `https://erddap.cdip.ucsd.edu/erddap/tabledap/wave_agg.json?station_id,metaStationName,latitude,longitude&distinct()` |
| `wave_agg.station-201.2026-10-08T00Z..2026-10-11T07Z.json` | `.../wave_agg.json?time,waveHs,waveTp,waveDp&station_id="201"&time>=2026-10-08T00:00:00Z`                             |

Station **201 = Scripps Nearshore** (La Jolla). The `stations.json` snapshot is
the station ↔ lat/lon registry the seed spot list links against.

## `coastwatch/` — VIIRS Kd490 clarity

| File                                          | Source query                                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `nesdisVHNkd490Daily.lajolla.2026-10-08.json` | `https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisVHNkd490Daily.json?kd_490[(2026-10-08T12:00:00Z)][(0.0)][(32.75)][(-117.5)]` |

Yields `kd_490 = 0.03424 m⁻¹` at 32.76°N, 117.51°W (Secchi ≈ 42 m — clear
offshore water).

## `coops/` — NOAA CO-OPS tides & observations

Station `9410230` (La Jolla, Scripps Wharf).

| File                                                     | Source query                                                                                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `predictions.9410230.2026-10-11.hourly.json`             | `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=today&station=9410230&product=predictions&datum=MLLW&time_zone=gmt&units=metric&format=json&interval=h` |
| `predictions.9410230.2026-10-11..2026-10-13.hourly.json` | `.../datagetter?begin_date=20261011&end_date=20261013&station=9410230&product=predictions&datum=MLLW&time_zone=gmt&units=metric&format=json&interval=h`                 |
| `predictions.9410230.2026-10-11..2026-10-13.hilo.json`   | `.../datagetter?begin_date=20261011&end_date=20261013&station=9410230&product=predictions&datum=MLLW&time_zone=gmt&units=metric&format=json&interval=hilo`              |
| `water_temperature.9410230.latest.json`                  | `.../datagetter?date=latest&station=9410230&product=water_temperature&time_zone=gmt&units=metric&format=json`                                                           |

The range pair (hourly + `hilo`) exercises the tide adapter: `interval=h` is the
curve, `interval=hilo` the high/low events it merges in. `date=today` is
day-granular and can't cover a 14-day window, so the adapter uses
`begin_date`/`end_date` (up to 1 year).

## Adding fixtures

- Prefer **server-side subsets** (Grib Filter `subregion=`, ERDDAP `griddap`
  indexing) to keep files tiny.
- Keep them **small and real**; record the exact query above so they can be
  refreshed.
- CI must not make live network calls (`AGENTS.md` rule 8).
