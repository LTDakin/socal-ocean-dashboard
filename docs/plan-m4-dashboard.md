# Plan — M4a: app shell + dashboard

Priority 3, first bullet of `todo-list.md`: *"Build the app shell + dashboard."*
**Done when:** `/` lists spots with current snapshots.

## Scope

The dashboard is a pure consumer of the envelopes in `api-contracts.md`. This
pass builds the routing shell, the design-token layer, the spots/favorites
state, the shared ECharts wrapper, and the dashboard itself. The spot **detail**
page (wave/swell chart, tide curve, surf-score strip) is the next todo.

### Backend (thin addition)

- **`GET /api/spots`** — the list endpoint the contract already describes: every
  curated spot plus a *lightweight* current snapshot so the dashboard renders
  without N+1 detail calls. `data.spots[]` carries the spot fields plus
  `snapshot` (waves, period/dir, water temp, wind, water level, tide state,
  clarity band), observation timestamps, and a short `tide.preview` (next ~24 h,
  hourly curve decimated to 3 h + every high/low) for the card sparkline.
- New `lib/providers/overview.ts`: pure `buildTidePreview` / `buildSpotOverview`
  / `assembleSpotsOverview` (unit-tested), plus `registry.getSpotsOverview()` that
  fans out to `/current`, `/clarity`, and a 24 h `/tides` window per spot with
  bounded concurrency, tolerating per-spot failure (a spot with no observation
  gets nulls, not a 5xx). Contract note added to `api-contracts.md`.

### Frontend

- **Shell** (`+layout.svelte`): sticky header (brand, nav, units toggle), main,
  minimal footer (attribution copy is the *next* todo — this is a placeholder).
- **Tokens** (`layout.css`): extend the ocean palette + base body typography.
- **State**: `lib/stores/favorites.svelte.ts` (localStorage-backed, seeded from
  `favoriteSeed`) and `lib/stores/preferences.svelte.ts` (units). Pure
  parse/serialize helpers live in plain `lib/stores/*.ts` so they unit-test
  without a DOM.
- **`lib/format`**: the single owner of conversion/formatting (ft/mph/°F vs
  metric, 16-point compass, relative time). Components never convert inline.
- **Charts**: `lib/charts/echarts.ts` (tree-shaken registration + `init`) and
  `lib/components/Chart.svelte` (the one shared wrapper: sized host, resize,
  dispose, option updates). `TideSparkline.svelte` composes it for the card.
- **Dashboard** (`/`): `+page.server.ts` loads `/api/spots`; `SpotCard` per spot;
  favorites section first, then **Surf spots** and **Dive spots**; text filter +
  favorites-only toggle; deliberate loading / empty / stale / no-observations
  states.

## Verification

- `pnpm test` — new `overview.spec.ts` + `format.spec.ts` + `stores` specs.
- `pnpm check && pnpm lint && pnpm build` green.
- Manual: `pnpm dev`, `/` shows 16 spots with live snapshots, favorites persist
  across reload, units toggle flips ft/°F ↔ m/°C.
