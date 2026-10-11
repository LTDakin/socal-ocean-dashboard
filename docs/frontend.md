# Frontend (apps/web)

SvelteKit (Svelte 5, runes) + TypeScript + Tailwind. ECharts for all charting.
The MapLibre map (free vector tiles, e.g. Protomaps or OpenFreeMap/Stadia) is
deferred to post-MVP. Data is in SI internally; units shown to users follow
audience convention (surfers think in feet; keep metric accents like °C optional
via a settings toggle).

## Scope

**Surf and dive only — no boating.** The dashboard's top level toggles between
*best surf spots* and *dive spots* (one activity at a time, so each activity's
decision data reads cleanly); the seed list (`lib/spots/spots.json`), the spot
model (`data-sources.md`), and every derived metric are scoped to those two use
cases (the `boat` type and the boat-only harbor spots were dropped).

## Pages

| Route | Purpose |
|---|---|
| `/` | **Dashboard:** Surf/Dive toggle, spot cards (current wave height, water temp, clarity band, tide state), favorites persisted locally, quick jump. Spots rank by how much information they carry (`compareSpotsByInfo`), then alphabetically — no longer a flat A–Z list. |
| `/spot/[id]` | **Spot detail:** current conditions panel, 14-day wave/swell chart, daily surf-score strip, tide curve, clarity card (labeled "observed"), data provenance footer (model run, asOf). |
| `/about` | **Attribution & methodology:** data credits, how each number is derived, and safety disclaimers. |

> Deferred: `/map` route with condition-colored spot markers (post-MVP).

## Key components

- `SpotCard` — compact conditions summary for the dashboard list.
- `WaveForecastChart` (ECharts) — multi-series: wave & swell height bars/lines,
  period+direction overlay, tooltips showing height/period/dir per day.
- `TideChart` — water-level curve with high/low markers and sunrise/sunset.
- `ClarityCard` — latest Kd490 → Secchi value + rating badge with "observed,
  not forecast" tag.
- `SurfScoreStrip` — per-day derived score (0-10).
- `ConditionsPanel` — "now" snapshot with per-field provenance; each metric
  (waves, water temp, wind, water level) carries a low→high `RangeMeter` and a
  qualitative band so a bare number reads as "kinda high" / "low".
- `RangeMeter` — CSS-only low→high scale with a value marker (no ECharts, like
  `SurfScoreStrip`); scales live in `lib/components/scales.ts`.

> Deferred: `SpotMap` (MapLibre) — clustered markers, condition-driven color
> scale, popup → detail.

## Conventions

- **Data access:** page `+page.server.ts` loaders call the backend endpoints
  from `api-contracts.md`; client components receive typed data. Client-side
  refresh (polling) only where freshness matters (current conditions).
- **Streaming:** the spot detail loader returns the slow 14-day forecast as an
  unawaited promise, so the shell, conditions panel, tide curve and clarity card
  render as soon as the fast endpoints answer and the forecast sections fill in
  via `{#await}` (`plan-perf-initial-load.md`).
- **State:** Svelte 5 runes; a `spots` store for shared spot list/favorites;
  favorites in `localStorage`.
- **Units & formatting:** a `lib/format` module owns all conversion/formatting
  (ft display, ordinal directions, "Updated X ago" from `asOf`).
- **Charting:** one shared ECharts wrapper component (options via props, data
  arrays from contracts) rather than ad-hoc init; charts resize with the
  container and support day-level zoom.
- **Empty/loading/stale states:** every chart/card renders a deliberate
  loading, empty, or "stale as of …" state (never a blank pane).
- **List ordering:** the dashboard never sorts flat A–Z. Favorites pin first,
  then `compareSpotsByInfo` (`lib/providers/overview.ts`) surfaces spots with
  real data and pushes unobserved/sparse spots to the bottom, with the name as
  the final tiebreak.
- **Styling:** Tailwind with a small design-token layer (ocean palette, type
  scale). Dark-mode-first fits the dashboard aesthetic.
- **Accessibility:** charts get table/alt fallbacks; color scales avoid
  red/green-only encodings (colorblind-safe). The "now" panel's range meters keep
  the number and the low/high end labels visible, so the colored position is
  never the only cue.

## Verification

- Manual QA at M4: verify each spot type (surf/dive) reads sensibly against
  fixtures.