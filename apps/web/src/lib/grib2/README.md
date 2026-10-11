# `lib/grib2` — GRIB2 decode seam

This module is the **only** place that touches GRIB2 binary decoding, so provider
adapters stay swappable and never import a decoder directly.

Per the M0 decision (see [`docs/plan-m0-scaffold.md`](../../../../../docs/plan-m0-scaffold.md)),
we do **not** build an in-house GRIB2 codec. Instead we wrap the maintained,
MIT-licensed [`@mattnucc/gribberish`](https://www.npmjs.com/package/@mattnucc/gribberish)
(Node bindings for the Rust `gribberish` reader: prebuilt binaries, zero runtime
deps, PNG + JPEG2000 packing, and wgrib2 `.idx` sidecar parsing for
single-field HTTP Range fetches).

The actual wrapper (fetch → decode → typed fields) is implemented alongside the
GFS-Wave adapter in a later milestone. Nothing is imported here yet.
