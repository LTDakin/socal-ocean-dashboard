# So-cal Ocean Dashboard

A data dashboard for monitoring ocean conditions along the Southern California
coast — waves, tides, currents, and underwater clarity — aimed at surfers and
divers.

## Status: PLANNING

This repository currently contains the technical plan only. No application code
exists yet. Implementation begins once the plan is approved.

## Documentation

- [`docs/README.md`](docs/README.md) — index and reading order for all docs
- [`docs/architecture.md`](docs/architecture.md) — system design, stack, cache, deployment
- [`docs/data-sources.md`](docs/data-sources.md) — upstream data providers, cadence, caveats
- [`docs/api-contracts.md`](docs/api-contracts.md) — normalized JSON contracts between backend and frontend
- [`docs/grib2-library.md`](docs/grib2-library.md) — plan for the open-sourceable GRIB2 parser
- [`docs/frontend.md`](docs/frontend.md) — Svelte frontend structure
- [`docs/milestones.md`](docs/milestones.md) — phased build plan with definitions of done

## Working agreements

See [`AGENTS.md`](AGENTS.md) for how this project should be worked on.