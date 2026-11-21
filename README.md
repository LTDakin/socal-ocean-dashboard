# So-cal Ocean Dashboard

[![CI](https://github.com/LTDakin/socal-ocean-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/LTDakin/socal-ocean-dashboard/actions/workflows/ci.yml)

Real-time conditions and a ~14-day forecast for Southern California surf and dive
spots: waves and swell (height, period, direction), tides, currents, water
temperature, and satellite-derived water clarity — all from NOAA / public-domain
sources.

## Status

- **20 curated SoCal spots** (`surf` and `dive`), San Diego → Santa Barbara.
- **Dashboard** (`/`) with a Surf/Dive toggle, favorites, and
  information-first ranking.
- **Spot detail** (`/spot/[id]`): "now" conditions panel with per-field
  provenance, 14-day wave/swell chart, daily surf-score strip, tide curve,
  clarity card, and a data-provenance footer.
- **`/about`**: data attribution, methodology, and safety disclaimers.
- **BFF API** for spots, current, forecast, tides, and clarity.

## Architecture at a glance

The browser only ever talks to this app. A SvelteKit server-route BFF fans out to
upstream providers, normalizes everything to one set of JSON contracts, and
caches aggressively so a busy site makes only a handful of upstream calls per
spot per day.

```
Browser (Svelte 5 · ECharts)
   │  JSON only
   ▼
SvelteKit server routes (BFF, apps/web)
   ├── Provider adapters   (one per upstream source)
   ├── TTL cache           (per spot, per source)
   ├── Derived metrics     (surf score, clarity/Secchi rating, daily aggregates)
   └── Pre-warm at boot    (fills the shared GRIB field cache)
   ▼
Upstream (public domain / free, no keys)
   NOMADS GFS-Wave (GRIB2) · CDIP · NOAA CO-OPS · NDBC · NOAA CoastWatch ERDDAP
```

Full design: [`docs/architecture.md`](docs/architecture.md).

### Stack

- **SvelteKit** (Svelte 5 runes) + **TypeScript**, **Tailwind CSS v4**
- **Apache ECharts** for all charting; MapLibre GL JS deferred post-MVP
- **GRIB2** decoded via the MIT-licensed
  [`@mattnucc/gribberish`](https://www.npmjs.com/package/@mattnucc/gribberish),
  isolated behind `apps/web/src/lib/grib2` (supersedes the earlier in-house codec
  plan — see [`apps/web/src/lib/grib2/HISTORY.md`](apps/web/src/lib/grib2/HISTORY.md))
- **pnpm** workspaces monorepo, Node 24 (`.nvmrc`), adapter-node for production

### Data sources

NOAA-primary and public domain, so there are no API keys or license cliffs.
Provider adapters are swappable and live in `apps/web/src/lib/providers`; nothing
else ever calls upstream directly.

| Source                  | Provides                                                 |
| ----------------------- | -------------------------------------------------------- |
| NOMADS GFS-Wave (GRIB2) | 16-day wave / swell / wind / current forecast            |
| CDIP                    | Near-shore buoy observations (near-shore accuracy)       |
| NOAA CO-OPS             | Tide predictions, water level, water temp, wind (gauges) |
| NDBC                    | Real-time buoy observations (gap-fill for CDIP)          |
| NOAA CoastWatch ERDDAP  | VIIRS Kd490 → water clarity / visibility (lags 2–3 days) |

Cadence, caveats, and attribution: [`docs/data-sources.md`](docs/data-sources.md).
Open-Meteo is a dev/fallback cross-check only (its free tier is non-commercial).

## Getting started

**Requirements:** Node 24 (see `.nvmrc`) and [pnpm](https://pnpm.io) 12
(`corepack enable` picks up the pinned version from `package.json`).

```bash
pnpm install     # install workspace dependencies
pnpm dev         # start the SvelteKit dev server for apps/web
```

### Scripts

All scripts run across the workspace via `pnpm -r --if-present`.

| Command        | What it does                    |
| -------------- | ------------------------------- |
| `pnpm dev`     | Run `apps/web` in dev mode      |
| `pnpm build`   | Production build (adapter-node) |
| `pnpm preview` | Preview the production build    |
| `pnpm lint`    | Prettier check + ESLint         |
| `pnpm format`  | Prettier write                  |
| `pnpm check`   | `svelte-check` type-checking    |
| `pnpm test`    | Vitest (runs once, no watch)    |

## Project layout

```
socal-ocean-dashboard/
  apps/
    web/                  # SvelteKit app
      fixtures/           # real (small) upstream samples for golden tests
      src/
        routes/           # pages, +page.server.ts loaders, /api endpoints
        lib/
          providers/      # adapters: gfswave, cdip, coops(+obs), ndbc, coastwatch
          grib2/          # GRIB2 decode seam (wraps @mattnucc/gribberish)
          cache/          # in-process TTL cache
          async/          # single-flight dedup, map-limit
          derive/         # surf score, visibility rating, daily aggregates
          spots/          # curated spot list + station linkage (spots.json)
          charts/         # ECharts option builders
          components/     # Svelte UI components
  docs/                   # architecture, data sources, contracts, plans
```

### API surface

Contracts are the source of truth in
[`docs/api-contracts.md`](docs/api-contracts.md).

| Endpoint                      | Purpose                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| `GET /api/spots`              | Curated spot list with a lightweight `current` snapshot per spot |
| `GET /api/spot/[id]/current`  | Merged real-time observation snapshot                            |
| `GET /api/spot/[id]/forecast` | ~14–16 day hourly + daily series, `surfScore`, `bestTimeWindow`  |
| `GET /api/spot/[id]/tides`    | CO-OPS tide predictions over the same window                     |
| `GET /api/spot/[id]/clarity`  | Latest observed satellite clarity (Kd490 → Secchi + rating)      |

Every response uses one envelope (`ok`, `asOf`, `stale`, `sources[]`, `data`), so
the UI can always show provenance and "Updated X ago" via `asOf`. Upstream
failures degrade gracefully to stale-or-null rather than erroring the page.

## Testing

Tests are **fixture-based** — no live network calls. Real upstream
samples live in `apps/web/fixtures/` so provider and parser behavior is
reproducible offline.

## License & attribution

Application code is **MIT**. Upstream data is public domain / openly licensed;
required credits are documented in [`docs/data-sources.md`](docs/data-sources.md)
and surfaced in-app on the `/about` page.
