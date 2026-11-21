# `lib/components` — "now" panel scales

`ConditionsPanel.svelte` shows each current condition with a CSS-only low→high
`RangeMeter` and a qualitative band. The number and end labels stay visible; color
is never the only cue (see [`docs/frontend.md`](../../../../../docs/frontend.md)).

Bounds and bands live in [`scales.ts`](scales.ts); the marker lives in
[`RangeMeter.svelte`](RangeMeter.svelte). Values are SI internally; display
ranges are judgement calls for Southern California.

| Metric (`ScaleKey`) | Display range                    | Bands, low → high                                    |
| ------------------- | -------------------------------- | ---------------------------------------------------- |
| `waves`             | 0–12 ft (0–3.66 m)               | Flat, Ankle, Knee, Waist, Chest, Head, Overhead, XXL |
| `waterTemp`         | 50–75 °F (10–23.9 °C)            | Cold, Cool, Mild, Warm, Toasty                       |
| `wind`              | 0–25 mph (0–11.18 m/s)           | Calm, Light, Moderate, Fresh, Strong                 |
| `waterLevel`        | −2 – +8 ft MLLW (−0.61 – 2.44 m) | Low, Mid, High                                       |

`scalePosition()` clamps out-of-range values to the track ends; the `*Band()`
helpers return the label. A missing value renders as `—` with no meter.

Why CSS rather than ECharts: the "now" panel is on the streamed detail page's
critical path, so four one-value gauges should not pull in the chart bundle
(`SurfScoreStrip` made the same call).
