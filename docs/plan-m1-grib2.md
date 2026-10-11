# Plan — M1: GRIB2 decode integration (`@mattnucc/gribberish`)

**Priority item:** `todo-list.md` → Priority 1, first bullet ("Integrate GRIB2
decoding"). Maps to `milestones.md` **M1** (the `inspect`/field-index helper half;
the codec-vs-build decision landed at M0).

**Status:** ✅ implemented — `lib/grib2` decode + field-index + NOMADS fetch seam;
`pnpm --filter web test/lint/check` and `pnpm build` green.

## Problem

NOMADS GFS-Wave arrives as GRIB2. Nothing in the app can read it yet: `lib/grib2`
holds only a `README.md`, so the M2 wave adapter has no decoder seam to build on.
Per architecture decision #4 we wrap [`@mattnucc/gribberish`](https://www.npmjs.com/package/@mattnucc/gribberish)
and keep it the **only** place that touches GRIB2 bytes, so adapters stay
swappable.

## Definition of done (from the todo list)

> one real GFS-Wave subset decodes to the expected fields.

Concretely: `lib/grib2` exposes decode (`bytes → typed fields with `validTime``),
a cheap `inspect`/field-index scan, and `.idx` + HTTP Range fetch helpers; a
golden test decodes the committed NOMADS fixtures to the cross-checked values
(`HTSGW` = 0.95 m at La Jolla in **both** the simple-packed subset and the
JPEG2000-packed full field).

## Design

### Types (`lib/grib2/types.ts`)

```ts
interface GribGrid {
  rows: number; cols: number;
  latitude: number[];           // row axis, stored order (asc or desc)
  longitude: number[];          // column axis, normalized to [-180, 180)
  northUp: boolean;             // 0th row is northern-most
  regular: boolean;             // false for curvilinear/flattened grids
}

interface GribFieldMeta {
  key: string;                  // gribberish message key, unique in file
  varName: string;              // long name, e.g. significantwaveheight
  varAbbrev: string;            // WMO/NCEP abbrev, e.g. HTSGW
  units: string;                // m | s | degree | ms-1
  validTime: string;            // ISO-8601 UTC (forecastDate)
  modelRun: string;             // ISO-8601 UTC (referenceDate)
  grid: GribGrid;
}

interface GribField extends GribFieldMeta {
  data: Array<number | null>;   // row-major; null where the bitmap masks
}
```

### Decode (`lib/grib2/decode.ts`)

- `inspectFields(bytes)` — metadata only (via `GribMessageMetadataFactory`), so
  adapters can scan a multi-field file without decoding value grids.
- `decodeFields(bytes)` — all messages → `GribField[]` (via
  `parseMessagesFromBuffer`); `decodeField(bytes)` for a single Range-fetched
  message (`GribMessage.parseFromBuffer(bytes, 0)`).
- `selectField(fields, { var, occurrence })` — pick one field by abbreviation;
  `occurrence` disambiguates repeats (`SWELL` 1/2/3) in file order.
- `sampleField(field, lat, lon)` — nearest regular-grid point (cos-lat weighted);
  returns the value, grid coords, and the sample point.
- Non-finite values (bitmap-masked / land) become `null`; a genuine decode
  failure throws `Grib2DecodeError` (no silent NaN).

Longitudes are normalized `[0,360) → [-180,180)` so the wcoast grid lines up with
negative spot longitudes.

### Field index (`.idx`) (`lib/grib2/index-file.ts`)

- `parseFieldIndex(text, fileSize?)` — wraps `parseGribIndex`.
- `selectIndexEntry(entries, { var, level?, forecastTime? })`.
- `byteRange(entry)` → `{ start, end, header }`; open-ended `bytes=N-` when the
  entry has no length (the last NOAA entry, unless the file size is known).

### Fetch (`lib/grib2/fetch.ts`)

Injectable `fetch` (default `globalThis.fetch`) so tests never hit the network.

- `buildNomadsWaveUrl(...)` → Grib Filter server-side subset URL.
- `buildNomadsWaveFileUrl(...)` → direct `.idx`+Range file URL.
- `fetchFieldIndex(fileUrl, deps?)` → `GribIndexEntry[]`.
- `fetchIndexedField(fileUrl, query, deps?)` → fetch one field by byte Range.
- `fetchSubsetFields(params, deps?)` → fetch + `decodeFields`.

## Files

```
apps/web/src/lib/grib2/
  types.ts        # grid, field metadata, field, selector, sample, error
  decode.ts       # inspect / decode / select / sample
  index-file.ts   # .idx parse, select, byte-range
  fetch.ts        # NOMADS URL builders + subset/idx-Range fetchers
  index.ts        # barrel
  grib2.spec.ts   # golden tests against fixtures/nomads/*
```

`@mattnucc/gribberish` moves from the lockfile-only entry to an
`apps/web/package.json` dependency.

## Out of scope

- The GFS-Wave adapter, forecast service, `lib/derive`, and endpoints — **M2**.
- Spot↔grid mapping (which GFS-Wave point belongs to a spot) — **M2**.
- Live-network tests; CI decodes committed fixtures only (`AGENTS.md` rule 8).
- Pinning/verifying prebuilt native binaries on the deploy host (deferred).

## Verification

1. `pnpm --filter web test` → golden decode of both NOMADS fixtures (HTSGW 0.95 m
   at La Jolla), metadata scan, `.idx` select + byte range, and an offline
   Range-fetch through a fake `fetch`.
2. `pnpm lint && pnpm check && pnpm build` green.
3. Manual read: `inspectFields` on the subset lists the 17 expected variables.

---

## Outcome

Shipped as planned:

- `lib/grib2/types.ts` — `GribGrid`, `GribFieldMeta`, `GribField`, `FieldSelector`,
  `FieldSample`, plus `Grib2DecodeError` / `Grib2FetchError`.
- `lib/grib2/decode.ts` — `inspectFields` (metadata-only scan), `decodeFields`,
  `decodeField`, `selectField`, `sampleField`. Longitudes normalized to
  `[-180, 180)`; NaN/bitmap-masked values → `null`.
- `lib/grib2/index-file.ts` — `parseFieldIndex`, `selectIndexEntry`, `byteRange`
  (open-ended for the final NOAA entry).
- `lib/grib2/fetch.ts` — `buildNomadsWaveUrl`, `buildNomadsWaveFileUrl`,
  `fetchFieldIndex`, `fetchIndexedField`, `fetchSubsetFields`; `fetch` injectable.
- `lib/grib2/grib2.spec.ts` — 8 golden tests over the committed fixtures.

`@mattnucc/gribberish@1.7.0` added to `apps/web` dependencies.

Decisions worth flagging:

- **Longitude normalization** happens in the seam (wcoast is `[0,360)`), so
  adapters sample against signed spot coordinates without special-casing.
- **`null` over NaN** for masked points; a real decode failure throws instead, per
  the "no silent NaN" risk mitigation.
- **`selectField` uses `occurrence`**, not level strings, because gribberish's
  decoded messages expose only the composite `key` (the `.idx` parser, by
  contrast, has verbatim `level`/`forecastTime`, which `selectIndexEntry` uses).
- **Fetch stays in the seam, the adapter stays M2** — URL building and Range
  fetches live here so the wave adapter is just spot→grid selection and contract
  shaping.

**Verification run (all green):** `pnpm --filter web test` ✅ (27 tests, 8 new) ·
`pnpm --filter web check` ✅ (0 errors, 0 warnings) · `pnpm --filter web lint` ✅ ·
`pnpm build` ✅.
