# AGENTS.md — So-cal Ocean Dashboard

Project-level instructions for any agent (or human) working in this repo.

## Project summary

- **Product:** an ocean-conditions dashboard for Southern California
  (surfers / divers / boaters). Real-time conditions + daily forecast out to
  ~14 days: waves, swell, tides, currents, water temperature, and
  satellite-derived water clarity/visibility.
- **Decisions already made (do not relitigate without a strong reason):**
  - NOAA primary, public-domain data sources. No monetization restrictions.
  - SvelteKit (Svelte 5) full-stack app; server routes act as a thin BFF that
    caches upstream data.
  - Apache ECharts for charting; MapLibre GL JS for the map.
  - A TypeScript GRIB2 parsing library, built in-repo but designed to be
    extracted and open-sourced later.
  - Open-Meteo is a dev/fallback cross-check only (its free tier is
    non-commercial).
- **Out of scope (v1):** global coverage, paid tiers, user accounts beyond
  local favorites.

## Working rules

1. **Plan before code.** Do not modify application code before reading the
   relevant files and writing/updating a plan. Plans live in `docs/`.
2. **"Ready to Code" gate.** The product owner signs off on the current plan
   with the exact phrase **"Ready to Code"** before implementation proceeds.
3. **Follow the docs.** `docs/README.md` defines the reading order and current
   status. Update docs when architecture/contracts change.
4. **Provider adapters are swappable.** All upstream data access goes through
   the adapter interface in `apps/web/src/lib/providers`. Never call upstream
   services directly from client code; never hard-code provider specifics in
   components.
5. **GRIB2 library stays generic.** `packages/grib2` must contain only GRIB2
   format logic (codec, templates, packing). NOAA/NCEP-specific parameter
   tables and wave-domain mapping live in the app, not the library, so the
   library can be open-sourced cleanly.
6. **Commit hygiene.** Conventional Commits. Keep `packages/grib2` history
   clean (no app-specific noise) so it can be extracted with `git subtree`
   later.
7. **Licensing.** `packages/grib2` is MIT from day one. App code is MIT. Data
   attribution per [`docs/data-sources.md`](docs/data-sources.md).
8. **Tests gate merges.** GRIB2 parser ships with fixture-based golden tests.
   App endpoints ship with contract tests against cached fixtures (no live
   network calls in CI).