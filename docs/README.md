# Docs Index

Whole-project and cross-cutting docs live here. Docs that describe one module's
functions live beside that module (see the co-located list below).

## Reading order

1. **[`architecture.md`](architecture.md)** — what we're building, system shape, and decisions.
2. **[`data-sources.md`](data-sources.md)** — upstream providers, cadence, caveats, and confirmed endpoints.
3. **[`api-contracts.md`](api-contracts.md)** — JSON envelope and per-endpoint payloads; source of truth for backend and frontend.
4. **[`frontend.md`](frontend.md)** — pages, components, charting, and UI conventions.

## Feature notes

- **[`plan-perf-initial-load.md`](plan-perf-initial-load.md)** — cold-cache diagnosis, pre-warm, cycle-scoped GRIB cache, single-flight, streamed detail.
- **[`plan-dashboard-activity-toggle.md`](plan-dashboard-activity-toggle.md)** — Surf/Dive toggle and information-first spot ordering.
- **[`plan-doc-colocation.md`](plan-doc-colocation.md)** — why docs are split between `docs/` and the code.

## Co-located docs

- [`lib/grib2/README.md`](../apps/web/src/lib/grib2/README.md) — GRIB2 decode seam; [`HISTORY.md`](../apps/web/src/lib/grib2/HISTORY.md) — superseded in-house codec plan.
- [`server/nomads/README.md`](../apps/web/src/server/nomads/README.md) — NOMADS URL builders and upstream fetchers.
- [`lib/components/README.md`](../apps/web/src/lib/components/README.md) — "now" panel scales and range meters.
- [`fixtures/README.md`](../apps/web/fixtures/README.md) — provenance of every committed upstream sample.

## Status markers

- `[ ]` planned · `[~]` in progress · `[x]` done
