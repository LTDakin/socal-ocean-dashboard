# Architecture

## What we're building

A fast, reliable ocean dashboard for Southern California: current conditions
and a ~14-day outlook for waves/swell (height, period, direction), tides,
currents, water temperature, and satellite-derived water clarity ("visibility")
at named surf/dive spots.

## System shape

```
Browser (Svelte 5, ECharts, MapLibre)
   │  JSON only
   ▼
SvelteKit server routes (BFF)  — apps/web
   ├── Provider adapters (one per upstream source)
   ├── TTL cache (per-spot, per-source)
   ├── Normalization + derived metrics (surf score, visibility rating)
   ├── Rate limiter / retry / backoff
   └── Pre-warm scheduler (cron)
   │  low-frequency, cached upstream calls
   ▼
Upstream (all public-domain / free)
   NOMADS GFS-Wave (GRIB2) · CDIP · NOAA CO-OPS · NDBC · NOAA CoastWatch ERDDAP
   (Copernicus GlobColour as optional future supplement)
```

**Key principle:** the browser never talks to the upstream providers. All
upstream traffic flows through the backend, which caches aggressively so a
busy public site makes only a handful of upstream calls per spot per day.

## Decisions & rationale

1. **NOAA-primary, public domain.** No keys, no license cliffs, no
   monetization restrictions. GFS-Wave is the same 16-day model Open-Meteo
   serves, CDIP gives us near-shore surf accuracy Open-Meteo can't, and
   CO-OPS gives real tide gauges at the spots themselves.
2. **SvelteKit as a full-stack BFF** (server routes on a Node host). Keeps one
   codebase/language (TypeScript) and one deploy target. No SSR requirement;
   server routes are the API.
3. **Swappable provider adapters.** Each upstream source is behind the same
   interface (`getSpotData(spot, window) -> normalized bundle`). This keeps
   optional sources (Copernicus, Open-Meteo cross-check) easy to add/remove.
4. **GRIB2 decoding via a maintained library.** NOMADS' 16-day wave forecasts
   arrive as GRIB2 binary. We decode them with the MIT-licensed
   [`@mattnucc/gribberish`](https://www.npmjs.com/package/@mattnucc/gribberish)
   (Node bindings for the Rust `gribberish` reader: prebuilt binaries, zero
   runtime deps, PNG + JPEG2000 packing, and wgrib2 `.idx` sidecar parsing for
   single-field HTTP Range fetches). A single app-level seam
   (`apps/web/src/lib/grib2`) isolates it so provider adapters stay swappable.
   **Superseded:** the earlier plan to build an in-house, extractable TypeScript
   codec (see [`grib2-library.md`](grib2-library.md), now historical). Revisit
   only if gribberish proves insufficient for the GFS-Wave scope.
5. **Cache in-process, Redis later.** A TTL map (`node-cache`-style) is enough
   for v1; Redis only if/when we run multiple instances.
6. **Metric vs imperial.** Internal data stays metric (SI). Display conversion
   only in the frontend.

## Project structure (monorepo, pnpm workspaces)

```
So-cal Ocean Dashboard/
  apps/
    web/              # SvelteKit app
      fixtures/       # small real NOMADS samples for golden tests
      src/
        routes/       # pages + +page.server.ts loaders + /api endpoints
        lib/
          providers/  # adapters: gfswave, cdip, coops, ndbc, coastwatch
          grib2/      # GRIB2 decode seam (wraps @mattnucc/gribberish)
          cache/
          derive/     # surf score, visibility rating, daily aggregates
          spots/      # curated SoCal spot list + station linkage
          components/
  docs/
```

## Backend notes

- **Endpoints** are defined in `api-contracts.md`. They read spot/config from a
  local JSON seed (v1) rather than a DB.
- **Cache keys:** `provider:spotId:window`. **TTLs** match upstream cadence
  (see `data-sources.md`): waves ~1h, buoy obs ~30m, model nearshore ~1-6h,
  tides ~6h, clarity ~24h.
- **Stale-if-error:** on upstream failure, serve the last successful payload
  with `stale: true` and `asOf` metadata rather than erroring.
- **Pre-warm:** a cron refreshes the N most popular spots each cycle so first
  visits are instant.
- **Health:** a `/api/health` endpoint reports per-provider last-good time and
  cache hit rate.

## Deployment

- SvelteKit with the Node adapter; static assets via CDN (Cloudflare/Vercel/
  similar); app on a small Node host (Fly.io / Railway / VPS).
- Env-driven config (spot list, cache TTLs, optional Copernicus token).
- No preferred deployment platform yet; decide at M7.