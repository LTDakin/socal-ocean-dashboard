# Docs Index

Reading order for a new agent:

1. **`architecture.md`** — what we're building and why it's shaped this way. Read first.
2. **`data-sources.md`** — every upstream provider, its cadence, and its caveats. Read before writing any provider code; contains an **audit task** to confirm exact endpoints.
3. **`api-contracts.md`** — the normalized JSON contracts the frontend consumes. Source of truth for both backend and frontend work.
4. **`grib2-library.md`** — historical: the earlier in-house GRIB2 codec plan (superseded — we now use `@mattnucc/gribberish`).
5. **`frontend.md`** — pages, components, charting, map, styling.
6. **`milestones.md`** — phased build order with definitions of done and verification steps.
7. **`plan-m0-scaffold.md`** — the M0 scaffold implementation plan (build-vs-buy decision, DoD, verification).

## Current status

- [x] Research: data sources evaluated
- [x] Stack & architecture decided (NOAA-primary, SvelteKit BFF, ECharts, MapLibre)
- [x] Tech plan written
- [x] Owner sign-off ("Ready to Code")
- [x] M0a: monorepo scaffold & developer tooling (`pnpm lint/check/test/build` green)
- [ ] Data audit (confirm exact endpoint URLs / dataset IDs) — see `data-sources.md`
- [ ] Seed spot list + provider adapter/cache foundation
- [ ] Implementation (GRIB2 decode → wave adapter → remaining adapters → frontend)

## Using status markers

Docs use these check markers:

- `[ ]` planned work
- `[~]` in progress
- `[x]` done
