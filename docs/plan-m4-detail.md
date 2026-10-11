# Plan — M4b: spot detail experience

Priority 3, second bullet of `todo-list.md`: *"Build the spot detail
experience."* **Done when:** detail works for surf/dive spots.

## Scope

`/spot/[id]` becomes a pure consumer of the four per-spot envelopes from
`api-contracts.md` (`/forecast`, `/tides`, `/current`, `/clarity`). The page
renders, top to bottom: a **conditions panel** ("now", per-field provenance), a
**surf-score strip** (per-day 0-10), the **14-day wave/swell chart**, the **tide
curve**, the **clarity card** ("observed, not forecast"), and a **provenance
footer** (model run + `asOf` per provider).

### Backend (small, contract-completing addition)

`docs/api-contracts.md` promises `surfScore` (0-10) and `bestTimeWindow` on the
forecast `daily[]`. They were deliberately left out of `lib/derive`'s first pass
("a small, mechanical change once the frontend milestone needs it —
`plan-m2-derive.md`"). This pass wires them:

- **`lib/derive/surf-score.ts`** — add `scoreSurfByDay(points, config?)`: pure
  per-UTC-day aggregation that scores every hour and keeps the best one
  (highest score, earliest on a tie). Returns `{ date, surfScore,
  bestTimeWindow, components }`.
- **`lib/providers/gfswave.ts`** — `buildGfsWaveForecast` scores the hourly
  series against the spot's `exposureDeg` and attaches the day's best to each
  `daily[]` row. `daily[]` items become `DailyWaveForecast extends
  DailyWaveSummary { surfScore, bestTimeWindow }`.

This keeps the frontend a pure consumer (no derivation in components) and
closes a contract gap the docs already named.

### Frontend

- **Loader** (`routes/spot/[id]/+page.server.ts`): resolve the spot
  (`404` via `error()` when unknown), then call the four detail endpoints in
  parallel through `fetch` (matching the dashboard loader). Each result degrades
  independently to `{ data: null, error }` so one down provider never blanks the
  page. Build the decimated tide curve from the `/tides` payload with the
  existing `buildTidePreview` (3 h step over the 14-day window).
- **Shared bits**:
  - `lib/format` — `formatDayLabel` (`Sun 11`) and `formatFullDate`
    (`Sun Oct 11`) for chart axes/tooltips. Still the one owner of formatting.
  - `lib/components/ratings.ts` — the clarity rating badge/dot/accent classes,
    extracted so `SpotCard` and `ClarityCard` can't drift.
  - `SpotCard` links its title to `/spot/[id]` (`resolve` route id + params).
- **Chart option builders** (pure, unit-tested):
  - `lib/charts/wave.ts` — `buildWaveForecastOption(daily, units)`: grouped
    wave/swell height bars + a period line on a second axis; tooltip carries
    height/period/direction per day.
  - `lib/charts/tide.ts` — add `buildTideCurveOption(points, units)`: the fuller
    tide curve (axes, area, high/low mark points) beside the existing sparkline.
- **Components** (thin shells over `Chart.svelte` / `lib/format`):
  `ConditionsPanel`, `SurfScoreStrip`, `WaveForecastChart`, `TideChart`,
  `ClarityCard`, `ProvenanceFooter`.
- **Page** (`+page.svelte`): header (name, region, types, favorite toggle, back
  link), the sections above, deliberate loading/empty/stale states, and a stale
  banner when any envelope is stale. A minimal `routes/+error.svelte` handles
  the 404.

## Verification

- `pnpm test` — new `scoreSurfByDay` specs, `format` day-label specs, and chart
  option-builder specs.
- `pnpm check && pnpm lint && pnpm build` green.
- Manual: `pnpm dev`, open `/spot/la-jolla-shores` (surf+dive) and
  `/spot/catalina-avalon` (dive, no buoy) — both render, units toggle flips the
  charts, and an unknown id shows the 404 page.
