# Plan: "now" panel condition scales

Refinement to the M4b spot detail "now" snapshot
(`ConditionsPanel.svelte`). Owner request:

> For each of waves, water temp, wind, and water level, show a low→high visual
> so a bare number ("12 mph") reads as "kinda high swell" / "low wind" without
> the reader knowing the units.

## Design

### What it looks like

Each of the four metrics in the "now" panel gains a **range meter**: a short
horizontal track painted with a low→high gradient, a marker sitting at the
current value's position, and the two end labels. A short **qualitative band**
("Flat" … "XXL", "Calm" … "Strong", …) sits next to the number, tinted with the
metric's accent color.

The number and end labels stay visible, so the visual is an *addition* to the
reading, never a replacement — color is never the only encoding
(`docs/frontend.md` → accessibility).

### Why CSS, not ECharts

The "now" panel is on the critical path of the streamed detail page
(`plan-perf-initial-load.md`) and renders from the fast `/current` endpoint
before the forecast. Pulling the ECharts bundle in for four one-value gauges
would undo that. `SurfScoreStrip` already made this call; the range meters
follow it. Implemented as a tiny presentational component (`RangeMeter.svelte`)
plus a pure scale module that is unit-testable.

### Scales (judgement-based, SI internally)

Bounds are chosen for Southern California surf/dive conditions and are the
"best judgement" the owner delegated. Defined in
`apps/web/src/lib/components/scales.ts`:

| Metric | Scale (display) | Bands (low → high) |
|---|---|---|
| Waves | 0 – 12 ft (0 – 3.66 m) | Flat, Ankle, Knee, Waist, Chest, Head, Overhead, XXL |
| Water temp | 50 – 75 °F (10 – 23.9 °C) | Cold, Cool, Mild, Warm, Toasty |
| Wind | 0 – 25 mph (0 – 11.18 m/s) | Calm, Light, Moderate, Fresh, Strong |
| Water level | −2 – +8 ft MLLW (−0.61 – 2.44 m) | Low, Mid, High |

### Colors (per metric, colorblind-considerate)

Track gradients run low→high; the marker uses the accent. No metric leans on a
red/green pair (the wind ramp runs teal → amber → orange, which survives
deuteranopia as a lightness/hue ramp; per `docs/frontend.md`).

- **Waves** — deep → bright ocean blue (`#2b6f8f → #4fb3d9 → #9fe0f5`).
- **Water temp** — thermal: cool blue → teal → amber → orange.
- **Wind** — calm teal → amber → orange (strength, not good/bad).
- **Water level** — indigo, distinct from the wave-blue (`#3d5a9e → #a9baf5`).

## Files

- **new** `apps/web/src/lib/components/scales.ts` — bounds, themes, position +
  band helpers.
- **new** `apps/web/src/lib/components/RangeMeter.svelte` — the track/marker.
- **new** `apps/web/src/lib/components/scales.spec.ts` — clamp/band tests.
- **edit** `apps/web/src/lib/components/ConditionsPanel.svelte` — build the
  meter per metric and render it under the value.
- **edit** `docs/frontend.md` — key components + conventions.

## Definition of done

- [x] Waves / water temp / wind / water level each show a low→high meter with a
      value marker and end labels.
- [x] Each metric carries a qualitative band label next to its number.
- [x] Missing values degrade: number shows `—`, no meter, panel unchanged.
- [x] `scalePosition` clamps out-of-range values to the track ends.
- [x] Band + position helpers unit-tested (`scales.spec.ts`).
- [x] `pnpm --filter web check && pnpm --filter web lint && pnpm --filter web test` green.
