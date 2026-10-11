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
- [x] Seed spot list (19 SoCal spots, station IDs filled in)
- [x] Provider adapter/cache foundation
- [ ] Implementation (GRIB2 decode → wave adapter → remaining adapters → frontend → ship)

## Using status markers

Docs use these check markers:

- `[ ]` planned work
- `[~]` in progress
- `[x]` done
