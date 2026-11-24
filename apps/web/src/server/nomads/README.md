# `server/nomads` — NOMADS URL builders and fetchers

Server-only counterpart to [`lib/grib2`](../../lib/grib2/README.md). The codec
seam stays format-agnostic; this module owns the NOAA/NOMADS hostnames, model-run
path tokens, and the two upstream fetch paths described in
[`docs/data-sources.md`](../../../../../docs/data-sources.md).

## API

| Export                                    | Purpose                                                    |
| ----------------------------------------- | ---------------------------------------------------------- |
| `formatCycle(cycle)`                      | Model run → NOMADS `YYYYMMDD` / `HH` / `tHHz` tokens.      |
| `buildNomadsWaveUrl(params)`              | NOMADS Grib Filter subset URL (variables, region, levels). |
| `buildNomadsWaveFileUrl(params)`          | Direct full-file URL, paired with the `.idx` sidecar.      |
| `fetchSubsetFields(params, deps)`         | Fetch + decode a region subset.                            |
| `fetchFieldIndex(fileUrl, deps)`          | Fetch a wgrib2 `.idx` sidecar.                             |
| `fetchIndexedField(fileUrl, query, deps)` | Fetch one field by HTTP Range and decode it.               |

`fetch` is injectable (`fetchImpl`) so tests and adapter specs replay the
committed fixtures under `apps/web/fixtures/nomads/` instead of touching the
network. Fetch/decode failures throw `Grib2DecodeError` / `Grib2FetchError`
rather than surfacing as NaN. The GFS-Wave adapter that consumes this module is
[`../providers/gfswave.ts`](../providers/gfswave.ts).
