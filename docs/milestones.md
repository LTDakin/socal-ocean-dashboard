# Milestones & Definitions of Done

Build order is dependency-first: scaffold → GRIB2 decode → wave adapter →
remaining adapters → frontend → ship. MVP scope assumes upstream APIs and the
GRIB2 library (`@mattnucc/gribberish`) work as documented — there is no separate
data-audit gate and no library-hardening milestone. Each milestone has a
**definition of done (DoD)**. Go/no-go between milestones is explicit.

---

## M0 — Scaffold, spots & BFF core
- [x] pnpm workspaces monorepo (`apps/web`); SvelteKit 3 + Tailwind v4; TS
  strict; lint/format/test/type-check wired; CI runs on Node LTS.
- [x] Seed spot list (~10–20 spots, mixed surf/dive/boat) in
  `apps/web/src/lib/spots/`, with station IDs filled in from `data-sources.md`.
- [x] Provider adapter interface + TTL cache foundation (the
  `getSpotData(spot, window) -> normalized bundle` seam, the
  `provider:spotId:window` cache, and the `ok/asOf/stale/sources` envelope),
  exercised end to end by one stub adapter.

**DoD:** monorepo green on `pnpm test/lint/build`; spot seed file exists; the
stub adapter returns a bundle through cache.
**Verify:** empty app boots locally.

---

## M1 — GRIB2 decode integration (via `gribberish`)
- [x] Decode through the `@mattnucc/gribberish` wrapper in
  `apps/web/src/lib/grib2` (fetch a NOMADS subset, or a single field via `.idx`
  Range, → typed fields with `validTime`). *(In-house codec superseded at M0.)*
- [x] Small `inspect`/field-index helper so adapters can scan fields cheaply.

**DoD:** one real GFS-Wave subset decodes to the expected fields. ✅ (`HTSGW` =
0.95 m at La Jolla in both the simple-packed subset and the JPEG2000 full field.)
**Verify:** `pnpm test` in `apps/web`; manual look at one field.
See [`plan-m1-grib2.md`](plan-m1-grib2.md).

---

## M2 — GFS-Wave adapter, forecast endpoint & derived metrics
- [ ] Adapter fetches per-cycle region-subsets, indexes/scans fields, builds
  hourly + daily series per the forecast contract.
- [ ] Cache (per-spot, per-cycle, TTL ~1 h) + stale-if-error.
- [ ] `GET /api/spot/[id]/forecast` green with provenance (`modelRun`, `asOf`).
- [ ] `lib/derive`: Secchi depth (ZSD ≈ 1.44/Kd490), rating bands, daily
  aggregations, experimental surf score.

**DoD:** one live SoCal spot returns a full ~14-day forecast through the BFF;
a fixture yields a deterministic score and ratings.
**Verify:** live smoke test against NOMADS.

---

## M3 — Tides, real-time observations & clarity
- [ ] CO-OPS adapter (tide predictions + water level), CDIP buoy obs (IOOS
  ERDDAP JSON), NDBC gap-fill.
- [ ] CoastWatch VIIRS Kd490 adapter (daily, ~24 h TTL), labeled "observed, not
  forecast".
- [ ] `current`, `tides`, and `clarity` endpoints per contracts.

**DoD:** `current` shows merged buoy+tide+clarity fields with provenance;
`tides` renders an MLLW curve for a spot; `clarity` shows observed clarity +
rating + `asOf`.
**Verify:** live smoke tests against each upstream.

---

## M4 — Frontend
- [ ] App shell, routing, Tailwind tokens, spots store + favorites, dashboard
  spot cards, ECharts wrapper, chart empty/loading/stale states.
- [ ] Spot detail: wave/swell chart, tide curve, clarity card, surf-score strip,
  condition panel, provenance footer.
- [ ] Attribution + safety disclaimers in the app footer (minimal about page).

**DoD:** `/` lists spots with current snapshots; spot detail works for one spot
of each type (surf/dive/boat); attribution and disclaimers are visible.
**Verify:** manual QA against fixtures.

---

## M5 — Ship
- [ ] Deploy (Node host + CDN); env-driven config.

**DoD:** the deployed site serves a working dashboard and spot detail.
**Verify:** manual smoke test of the deployed URL.

---

## Deferred (post-MVP)

Not needed to validate the MVP; revisit once the core loop is live.

- MapLibre spot map with condition-driven colors.
- Full about / methodology page.
- Resilience layer: rate limiting, retry/backoff, pre-warm cron, error telemetry.
- Pinning/verifying `@mattnucc/gribberish` prebuilt binaries on the deploy host.
- Contract/golden test coverage beyond the minimum needed to trust a value.

---

## Risks & mitigations (summary)

| Risk | Mitigation |
|---|---|
| GRIB2 packing edge cases | Surface decode failures clearly (no silent NaN) |
| NOMADS endpoint churn | Adapter isolation; Open-Meteo as dev cross-check |
| Visibility data is observed, not forecast | UI labeling + "asOf"; set expectations in `/about` |
| Open-Meteo non-commercial clause | Not used for v1 product data; dev-only cross-check |
| Upstream downtime | Stale-if-error (full resilience layer deferred) |
