## Project summary

- **Product:** an ocean-conditions dashboard for Southern California
  (surfers / divers). Real-time conditions + daily forecast out to
  ~14 days: waves, swell, tides, currents, water temperature, and
  satellite-derived water clarity/visibility.

## Working rules

1. **Plan, then build** When assigned a feature or refactor,
   read the relevant files, write/update a short plan in `scratch/`, check your 
  work on the plan and then go ahead with the build. The plan will be used to check
  your work by a reviewer.
2. **Ask only on genuine blockers.** If a todo is ambiguous, contradicts a
   "Decisions already made" item, or needs credentials/accounts, ask before
   proceeding. Otherwise, when you are set on a todo, start building.
4. **Provider adapters are swappable.** All upstream data access goes through
   the adapter interface in `apps/web/src/lib/providers`. Never call upstream
   services directly from client code; never hard-code provider specifics in
   components.
5. **GRIB2 library stays generic.** `packages/grib2` must contain only GRIB2
   format logic (codec, templates, packing). NOAA/NCEP-specific parameter
   tables and wave-domain mapping live in the app, not the library, so the
   library can be open-sourced cleanly.
6. **Decisions already made (do not relitigate without a strong reason):**
  - NOAA primary, public-domain data sources. No monetization restrictions.
  - SvelteKit (Svelte 5) full-stack app; server routes act as a thin BFF that
    caches upstream data.
  - Apache ECharts for charting; MapLibre GL JS for the map.
  - A TypeScript GRIB2 parsing library, built in-repo but designed to be
    extracted and open-sourced later.
  - Open-Meteo is a dev/fallback cross-check only (its free tier is
    non-commercial).
