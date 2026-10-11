# `lib/grib2` — GRIB2 decode seam

This module is the **only** place that touches GRIB2 binary decoding, so provider
adapters stay swappable and never import a decoder directly.

Per the M0 decision (see [`docs/plan-m0-scaffold.md`](../../../../../docs/plan-m0-scaffold.md)),
we do **not** build an in-house GRIB2 codec. Instead we wrap the maintained,
MIT-licensed [`@mattnucc/gribberish`](https://www.npmjs.com/package/@mattnucc/gribberish)
(Node bindings for the Rust `gribberish` reader: prebuilt binaries, zero runtime
deps, PNG + JPEG2000 packing, and wgrib2 `.idx` sidecar parsing for
single-field HTTP Range fetches).

## API

| Export                                          | Purpose                                                  |
| ----------------------------------------------- | -------------------------------------------------------- |
| `inspectFields(bytes)`                          | Metadata-only scan of every message (cheap field index). |
| `decodeFields(bytes)`                           | Decode all messages → `GribField[]`.                     |
| `decodeField(bytes)`                            | Decode a single HTTP-Range-fetched message.              |
| `selectField(fields, { var, occurrence? })`     | Pick one field by abbreviation.                          |
| `sampleField(field, lat, lon)`                  | Nearest regular-grid value (nulls where masked).         |
| `parseFieldIndex(text, fileSize?)`              | Parse a wgrib2 `.idx` / ECMWF `.index` sidecar.          |
| `selectIndexEntry` / `byteRange`                | Resolve one message's `Range` request.                   |
| `buildNomadsWaveUrl` / `buildNomadsWaveFileUrl` | NOMADS Grib Filter / direct-file URLs.                   |
| `fetchSubsetFields` / `fetchIndexedField`       | Fetch+decode a subset, or one field by Range.            |

`validTime` is the forecast instant; `modelRun` is the reference/initialization
time. Row-major values use `null` for bitmap-masked points (land / out-of-domain),
and longitudes are normalized to `[-180, 180)`. Decode/fetch failures throw
`Grib2DecodeError` / `Grib2FetchError` rather than surfacing as NaN.

Golden tests decode the committed fixtures in
[`apps/web/fixtures/nomads/`](../../../fixtures/README.md) (HTSGW = 0.95 m at La
Jolla in both the simple-packed subset and the JPEG2000 full field). The GFS-Wave
adapter itself is M2 ([`docs/plan-m1-grib2.md`](../../../../../docs/plan-m1-grib2.md)).
