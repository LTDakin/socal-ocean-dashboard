# Frontend (apps/web)

SvelteKit (Svelte 5, runes) + TypeScript + Tailwind. ECharts for all charting;
MapLibre GL JS for the map with free vector tiles (e.g., Protomaps or
OpenFreeMap/Stadia). Data is in SI internally; units shown to users follow
audience convention (surfers/boaters think in feet; keep metric accents like
°C optional via a settings toggle).

## Pages

| Route | Purpose |
|---|---|
| `/` | **Dashboard:** spot cards (current wave height, water temp, clarity band, tide state), favorites persisted locally, quick jump. |
| `/spot/[id]` | **Spot detail:** current conditions panel, 14-day wave/swell chart, daily surf-score strip, tide curve, clarity card (labeled "observed"), data provenance footer (model run, asOf). |
| `/map` | **Map:** spot markers colored by a chosen condition (wave height / clarity band); click → detail. |
| `/about` | Methodology + data credits/attribution + disclaimers (blast radius: safety product disclaimers). |

## Key components

- `SpotCard` — compact conditions summary for the dashboard list.
- `WaveForecastChart` (ECharts) — multi-series: wave & swell height bars/lines,
  period+direction overlay, tooltips showing height/period/dir per day.
- `TideChart` — water-level curve with high/low markers and sunrise/sunset.
- `ClarityCard` — latest Kd490 → Secchi value + rating badge with "observed,
  not forecast" tag.
- `SurfScoreStrip` — per-day derived score (0-10).
- `ConditionsPanel` — "now" snapshot with per-field provenance.
- `SpotMap` (MapLibre) — clustered markers, condition-driven color scale,
  popup → detail.

## Conventions

- **Data access:** page `+page.server.ts` loaders call the backend endpoints
  from `api-contracts.md`; client components receive typed data. Client-side
  refresh (polling) only where freshness matters (current conditions).
- **State:** Svelte 5 runes; a `spots` store for shared spot list/favorites;
  favorites in `localStorage`.
- **Units & formatting:** a `lib/format` module owns all conversion/formatting
  (ft display, ordinal directions, "Updated X ago" from `asOf`).
- **Charting:** one shared ECharts wrapper component (options via props, data
  arrays from contracts) rather than ad-hoc init; charts resize with the
  container and support day-level zoom.
- **Empty/loading/stale states:** every chart/card renders a deliberate
  loading, empty, or "stale as of …" state (never a blank pane).
- **Styling:** Tailwind with a small design-token layer (ocean palette, type
  scale). Dark-mode-first fits the dashboard aesthetic.
- **Accessibility:** charts get table/alt fallbacks; color scales avoid
  red/green-only encodings (colorblind-safe).

## Verification

- End-to-end: one spot renders full detail using recorded/cached fixtures
  (no live upstream in CI).
- Manual QA at M6: verify each spot type (surf/dive/boat) reads sensibly.