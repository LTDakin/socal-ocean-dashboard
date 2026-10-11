# Plan — M2 (part 2): derived metrics (`lib/derive`)

**Priority item:** `todo-list.md` → Priority 1, third bullet ("Build the
derived-metrics service (`lib/derive`)"). Maps to the second half of
`milestones.md` **M2**. Daily aggregations shipped with the GFS-Wave adapter
(`lib/derive/daily.ts`); **Secchi rating bands and the surf score remain**.

**Status:** ✅ implemented — `lib/derive/clarity.ts` + `lib/derive/surf-score.ts`,
both fixture-driven and unit-tested. Not yet wired into the `/forecast`
`daily[]` payload (see *Out of scope*).

## Problem

The forecast contract (`docs/api-contracts.md`) promises two derived values the
raw adapters can't produce:

- a **surf score** (0-10) from swell height, period, direction relative to a
  spot's exposure, wind, and (later) tide; and
- a **visibility rating** (`poor | fair | good | excellent`) from the observed
  Secchi depth (`ZSD ≈ 1.44 / Kd490`).

Both are pure functions of upstream values, with thresholds that will need
tuning. Keeping them in `lib/derive` (not in the adapters) means they can be
reasoned about and unit-tested in isolation — `AGENTS.md` rule 4 and the
architecture's "normalization + derived metrics" layer.

## Definition of done (from the todo list)

> a fixture yields a deterministic score and ratings.

Plus fixture-backed unit tests (no live network; `AGENTS.md` rule 8).

## Design

### `lib/derive/clarity.ts`

```ts
secchiDepthM(kd490)        // ZSD ≈ 1.44 / Kd490 (Kirk); null for non-positive/non-finite
clarityRating(secchiM)     // 'poor' | 'fair' | 'good' | 'excellent' | null
deriveClarity(kd490)       // { kd490, secchiDepthM, rating }
CLARITY_BANDS              // ascending lower bounds, exported for the UI legend
```

Bands (Secchi depth, m): `poor < 5`, `fair 5–<10`, `good 10–<20`,
`excellent ≥ 20`. These are the "neat-appearing thresholds" the data-sources doc
places here.

### `lib/derive/surf-score.ts`

```ts
scoreSurf(input, config?)            // number | null — 0-10, null when unscoreable
scoreSurfComponents(input, config?)  // { score, components } for debugging/UI
DEFAULT_SURF_SCORE_CONFIG
```

Each input component maps to `0..1`; the score is the weighted mean ×10. A
component whose inputs are missing is dropped and the weights renormalized across
the components that *are* available, so a partial sample never silently reads as
"flat". If no component is computable the score is `null` (mirrors `lib/grib2`'s
no-silent-NaN rule).

Default weights: **size 0.35 · period 0.25 · direction 0.25 · wind 0.15 · tide
0.00**. Tide ships as an input + component but is weighted `0` for v1 because we
have no per-spot tide preference and CO-OPS water levels arrive in M3; the
weight is a config knob for when they do.

Component definitions (all SI, all clamped to `0..1`):

- **size** — ramp `(swellHeightM − minM) / (idealM − minM)`, `minM 0.3`,
  `idealM 3.0 m` (saturates; no "too big is better" falloff in v1).
- **period** — ramp `(swellPeriodS − minS) / (idealS − minS)`, `minS 7`,
  `idealS 18 s`.
- **direction** — linear falloff on the angular gap between swell direction and
  the spot's `exposureDeg`: `1 − Δ/90°`.
- **wind** — blends *how offshore* the wind is with its strength:
  `directionQuality = (cos(Δ to exposure+180°) + 1) / 2` (1 offshore, 0 onshore),
  `s = windSpeed / 10 m·s⁻¹`, `quality = (1 − s)·0.6 + s·directionQuality`
  (calm is mildly good regardless of direction; strong wind takes the
  offshore/onshore sign in full).
- **tide** — `1 − |tideHeightM − idealM| / toleranceM`, `idealM 1.0 m`,
  `toleranceM 1.5 m` (weight `0` by default).

The score is explicitly experimental in v1 (`data-sources.md`), so the config is
fully injectable and the raw components are exposed for the UI to show its work.

## Files

```
apps/web/src/lib/derive/clarity.ts        # Secchi + rating bands
apps/web/src/lib/derive/clarity.spec.ts   # fixture (CoastWatch) + band/edge tests
apps/web/src/lib/derive/surf-score.ts     # pure score + component breakdown
apps/web/src/lib/derive/surf-score.spec.ts# fixture (NOMADS) + component tests
apps/web/src/lib/derive/index.ts          # re-exports
```

## Out of scope

- Wiring `surfScore` / `bestTimeWindow` into the `/forecast` `daily[]` payload.
  The contract names them, but with no per-spot tide preference yet and no
  frontend consumer, the adapter stays a pass-through. It becomes a small,
  mechanical change once the frontend milestone needs it.
- The clarity **adapter** + `/clarity` endpoint (CoastWatch VIIRS) — M3.
- Per-spot tide preferences and the tide weight — post-M3.

## Verification

1. `pnpm --filter web test` — band boundaries, Secchi math + guards, score
   component math, weight renormalization on missing inputs, and one
   fixture-derived score/rating.
2. `pnpm lint && pnpm check && pnpm build` green.

---

## Outcome

Implemented as planned.

- `lib/derive/clarity.ts` — `secchiDepthM`, `clarityRating`, `deriveClarity`,
  `CLARITY_BANDS`. The committed CoastWatch fixture
  (`kd_490 = 0.03424 m⁻¹`) yields **Secchi ≈ 42.06 m → `excellent`**.
- `lib/derive/surf-score.ts` — `scoreSurf` / `scoreSurfComponents` with an
  injectable `DEFAULT_SURF_SCORE_CONFIG`. The committed NOMADS La Jolla fixture
  scores a deterministic value (pinned in the spec).
- `lib/derive/index.ts` — re-exports the new surface; `aggregateDaily` unchanged.

Deviations worth flagging:

- **Tide component weighted `0`** by default — forward-compatible input, no
  effect until per-spot preferences + CO-OPS land (documented above).
- **`surfScore`/`bestTimeWindow` not added to `daily[]` yet.** Kept standalone
  per the todo's "separate from raw adapters" framing; see *Out of scope*.
- **`clarityRating` returns `null`** for unparseable/non-positive input rather
  than defaulting to `poor`, so a missing satellite pixel is never shown as bad
  water.
