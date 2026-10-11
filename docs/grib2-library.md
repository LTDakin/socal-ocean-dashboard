# GRIB2 Parsing Library

> **Superseded (M0, Oct 2026).** This document describes an earlier plan to build
> an in-house TypeScript GRIB2 codec. We instead adopted the maintained,
> MIT-licensed [`@mattnucc/gribberish`](https://www.npmjs.com/package/@mattnucc/gribberish)
> behind the `apps/web/src/lib/grib2` seam (see `architecture.md` decision 4 and
> `plan-m0-scaffold.md`). Kept for historical context; the "Open-sourcing
> checklist" below no longer applies.

Why: NOMADS GFS-Wave (the 16-day wave source) ships as GRIB2 binary. We decode
it in-house so we can (a) stay fully TypeScript/public-domain, and (b)
potentially open-source the library later. It is the only substantial
greenfield dependency in this project.

## Goals

- A focused GRIB2 **codec** in TypeScript that decodes NCEP GFS-Wave files
  into typed field metadata + decoded data arrays.
- **Open-sourceable:** MIT licensed from day one, zero/minimal runtime
  dependencies, generic (no SoCal/wave-domain business logic inside).
  Extraction path is `git subtree` into a standalone repo + npm publish.
- Pragmatic scope, not a full WMO GRIB2 implementation: support what
  NOMADS/GFS-Wave actually emit; degrade gracefully on anything else.

## Scope

- **Sections:** parse 0 (indicator), 1 (identification), 3 (grid), 4
  (product), 5 (data representation), 6 (bitmap), 7 (data), 8 (end).
- **Grid templates:** 3.0 lat/lon (enough for GFS-Wave) — read shape from the
  template; don't build a general grid library.
- **Product templates:** 4.0/4.1 and friends as needed to recover
  discipline/category/parameter and ref-time + forecast step → `validTime`.
- **Data templates:** simple packing, complex packing, complex + spatial
  differencing, and preprocessing variants (the ones NOMADS files use most);
  PNG (5.5) via Node's built-in `zlib`. JPEG2000 and other exotic templates are
  recorded as "unsupported" with a clear error — revisit only if an audit shows
  we actually need them.
- **Bitmaps** and missing-value handling.
- **Field lookup:** resolve (discipline, category, parameter) + forecast step
  using WMO/NCEP code tables. Keep the *code tables* generic in the library and
  put the *NCEP wave-variable mapping* (which fields we actually pull for the
  dashboard) in the app — that separation is what keeps the lib extractable.

## Architecture (package layout)

```
packages/grib2/
  src/
    reader/      # binary buffer reader, bit reading
    sections/    # section 0-8 parsers
    templates/   # grid / product / data template readers
    decode/      # packing math: simple, complex, spatial differencing, PNG
    tables/      # generic WMO code tables (parameter lookup)
    index.ts     # public API: read/inspect/iterate fields
  fixtures/      # small real NOMADS subsets (committed) for golden tests
  test/          # vitest; golden cross-checks vs wgrib2 output
  README.md, LICENSE (MIT), CONTRIBUTING.md
```

Public API sketch (exact signatures are for the implementer):

```
readFields(buffer, { discipline?, category?, parameter?, stepRange? }) -> Field[]
Field = { meta: { id, name, units, refTime, validTime, gridShape, ... },
          data: Float32Array /* row-major over gridShape */ }
inspect(buffer) -> SectionSummary[]   // debugging CLI aid
```

## What a senior implementer should nail

1. **Correct packing math** (scaling: binary/decimal scale, reference value,
   bits; group decoding for complex packing; spatial differencing
   reconstruction). This is where subtle bugs live — cross-check every golden
   fixture against `wgrib2` output.
2. **Time axis** correctness: ref-time from section 1 + forecast step from
   section 4 → ISO `validTime` for every field.
3. **Streaming/deflation for NOMADS runs:** a 16-day run is many small per-hour
   files; provide a small index/scan helper so adapters can find the fields
   they need without re-parsing.
4. **Misses are explicit:** unknown template/parameter → typed `UnsupportedError`
   listing what it saw, never silent NaN.

## Testing & verification

- Golden fixtures: small region-subsets of real GFS-Wave files (saved in
  `fixtures/`, CI against them, no live network in CI). Values compared field
  by field against `wgrib2` dump output.
- Unit tests per packing mode; property tests round-tripping synthetic data.
- CI: `pnpm test` on Node LTS; coverage gate (target ≥ ~85% for `decode/`).
- A `docs/VERIFICATION` checklist entry: decode one full 16-day cycle for a
  SoCal point and diff against Open-Meteo as a sanity check (values should
  track, since Open-Meteo serves the same GFS-Wave model).

## Open-sourcing checklist (when ready)

- Extract `packages/grib2` to its own repo (clean history via `git subtree`).
- npm publish (`grib2` or similar name — check availability at publish time).
- README with usage + supported template matrix; MIT header; CONTRIBUTING.
- Keep app specifics (adapters, NCEP field mapping, fixtures sourced from
  NOMADS) out of the published package — ship only the codec.