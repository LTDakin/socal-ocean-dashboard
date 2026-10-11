# Docs Index

Reading order for a new agent:

1. **`architecture.md`** — what we're building and why it's shaped this way. Read first.
2. **`data-sources.md`** — every upstream provider, its cadence, and its caveats. Read before writing any provider code.
3. **`api-contracts.md`** — the normalized JSON contracts the frontend consumes. Source of truth for both backend and frontend work.
4. **`grib2-library.md`** — historical: the earlier in-house GRIB2 codec plan (superseded — we now use `@mattnucc/gribberish`).
5. **`frontend.md`** — pages, components, charting, map, styling.
6. **`milestones.md`** — phased MVP build order with definitions of done.
7. **`plan-m0-scaffold.md`** — the M0 scaffold implementation plan (build-vs-buy decision, DoD, verification).
8. **`plan-m0-spots.md`** — the seed spot list plan.
9. **`plan-m0-providers.md`** — the provider adapter + cache foundation (BFF core) plan.
10. **`plan-m1-grib2.md`** — the GRIB2 decode seam (`lib/grib2`) plan.
11. **`plan-m2-gfswave.md`** — the GFS-Wave adapter + `/forecast` endpoint plan.
12. **`plan-m2-derive.md`** — the derived-metrics (`lib/derive`) plan: Secchi rating bands + surf score.
13. **`plan-m3-tides.md`** — the CO-OPS tides service + `/tides` endpoint plan.
14. **`plan-m3-observations.md`** — the real-time observations service
    (CDIP + NDBC gap-fill + CO-OPS observations) + `/current` endpoint plan.
15. **`plan-m3-clarity.md`** — the CoastWatch VIIRS Kd490 clarity service +
    `/clarity` endpoint plan.
16. **`plan-m4-dashboard.md`** — the app shell + dashboard plan (`/api/spots`
    list endpoint, favorites, shared ECharts wrapper).
17. **`plan-m4-detail.md`** — the spot detail page plan (conditions panel,
    14-day wave/swell chart, surf-score strip, tide curve, clarity card,
    provenance footer; wires `surfScore`/`bestTimeWindow` into `daily[]`).
18. **`plan-m4-attribution.md`** — the attribution / safety-disclaimer plan
    (shared `lib/attribution` credits + the `/about` methodology page).
19. **`plan-perf-initial-load.md`** — the initial-load performance plan
    (cold-cache diagnosis; boot pre-warm, cycle-scoped GRIB field cache,
    single-flight dedup; streamed spot detail).
20. **`plan-dashboard-activity-toggle.md`** — the dashboard surf/dive activity
    toggle + information-first spot ordering.
21. **`plan-now-condition-scales.md`** — the "now" panel low→high range meters
    (waves / water temp / wind / water level) + qualitative bands.

> **MVP scope note.** `todo-list.md` and `milestones.md` assume the upstream APIs
> and the GRIB2 library work as documented. There is no separate data-audit gate,
> and library-hardening, exhaustive tests, the map, and the resilience layer are
> deferred to post-MVP.

## Current status

- [x] Research: data sources evaluated
- [x] Stack & architecture decided (NOAA-primary, SvelteKit BFF, ECharts, MapLibre)
- [x] Tech plan written
- [x] Owner sign-off ("Ready to Code")
- [x] M0a: monorepo scaffold & developer tooling (`pnpm lint/check/test/build` green)
- [x] Seed spot list (16 SoCal surf/dive spots, station IDs filled in)
- [x] Provider adapter/cache foundation
- [x] M1: GRIB2 decode seam (`lib/grib2`; fixtures decode to the cross-checked values)
- [x] M2a: GFS-Wave adapter + `GET /api/spot/[id]/forecast` (live-verified)
- [x] M2b: derived metrics (`lib/derive`): daily aggregates, Secchi rating bands, surf score
- [x] M3a: tides service (`coops` adapter + `GET /api/spot/[id]/tides`)
- [x] M3b: real-time observations (`cdip`, `ndbc`, `coops-obs` adapters +
      `GET /api/spot/[id]/current` with per-field provenance)
- [x] M3c: clarity service (`coastwatch` adapter + `GET /api/spot/[id]/clarity`,
      observed-not-forecast; live-verified)
- [x] M4a: app shell + dashboard (`GET /api/spots`, spots/favorites stores,
      `lib/format`, shared ECharts wrapper, `/` surf+dive spot cards; live-verified)
- [x] M4b: spot detail experience (`/spot/[id]`: conditions panel, wave/swell
      chart, surf-score strip, tide curve, clarity card, provenance footer;
      `surfScore`/`bestTimeWindow` wired into `daily[]`)
- [x] M4c: attribution, safety disclaimers & the about/methodology page
      (shared `lib/attribution` credits, footer roll-up + link, `/about` page)
- [ ] M5: ship (deploy + env-driven config)

## Using status markers

Docs use these check markers:

- `[ ]` planned work
- `[~]` in progress
- `[x]` done
