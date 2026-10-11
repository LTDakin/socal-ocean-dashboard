# Milestones & Definitions of Done

Build order is dependency-first: the GRIB2 codec → wave adapter → remaining
adapters → frontend. Each milestone has a **definition of done (DoD)** and
**verification** step. Go/no-go between milestones is explicit.

---

## M0 — Scaffold & data audit
- [x] pnpm workspaces monorepo (`apps/web`); SvelteKit 3 + Tailwind v4; TS
  strict; lint/format/test/type-check wired; CI runs on Node LTS.
- [ ] Complete the **data audit** from `data-sources.md`: confirm exact NOMADS
  Grib Filter URL/dirs, a real GFS-Wave sample file saved to
  `apps/web/fixtures/`, CDIP ERDDAP dataset IDs, CoastWatch NRT Kd490
  dataset, CO-OPS station IDs for first spots.
- [ ] Curate seed spot list (~10-20 spots, mixed surf/dive/boat) in
  `apps/web/src/lib/spots/`.

**DoD:** monorepo green on `pnpm test/lint/build`; audit doc updated with every
confirmed URL/dataset ID; spot seed file exists.
**Verify:** empty app boots locally; fixtures play through the (stub) codec.

---

## M1 — GRIB2 decode integration (via `gribberish`)
- [x] ~~In-house codec~~ — superseded at M0: decode through the
  `@mattnucc/gribberish` wrapper in `apps/web/src/lib/grib2` (fetch a NOMADS
  subset, or a single field via `.idx` Range, → typed fields with `validTime`).
- [ ] Golden test against a committed GFS-Wave fixture, cross-checked vs `wgrib2`.
- [ ] Small `inspect`/field-index helper so adapters can scan fields cheaply.

**DoD:** decodes the M0 GFS-Wave fixture with values matching `wgrib2`;
unsupported templates are surfaced clearly (not silent NaN).
**Verify:** `pnpm test` in `apps/web`; manual diff of one field vs `wgrib2`.

---

## M2 — GFS-Wave adapter + forecast endpoint
- [ ] Adapter fetches per-cycle region-subsets (small downloads), index/scan
  fields, builds hourly + daily series per the forecast contract.
- [ ] Cache (per-spot, per-cycle, TTL ~1 h) + stale-if-error.
- [ ] `GET /api/spot/[id]/forecast` green with provenance
  (`modelRun`, `asOf`).

**DoD:** one live SoCal spot returns a full ~14-day forecast through the BFF;
second request within TTL hits cache (no upstream call).
**Verify:** contract test against a recorded fixture; live smoke test against
NOMADS; 16-day series values sanity-checked against Open-Meteo (same model).

---

## M3 — Tides + real-time observations
- [ ] CO-OPS adapter (tide predictions + water level), CDIP buoy obs (IOOS
  ERDDAP JSON), NDBC gap-fill.
- [ ] `current` and `tides` endpoints per contracts.

**DoD:** `current` shows merged buoy+tide+clarity fields with provenance;
`tides` renders a correct MLLW curve for a spot.
**Verify:** contract tests; cross-check one tide station vs CO-OPS web output.

---

## M4 — Clarity + derived metrics
- [ ] CoastWatch VIIRS Kd490 adapter (daily, ~24 h TTL; explicit cloud
  gaps/latency in payload).
- [ ] `clarity` endpoint + `lib/derive`: Secchi depth (ZSD ≈ 1.44/Kd490),
  rating bands, daily aggregations, experimental surf score.

**DoD:** spot shows observed clarity with rating + "asOf" labeling; surf score
deterministic and unit-tested.
**Verify:** unit tests for derivation thresholds; visual check against known
clear/murky periods.

---

## M5 — Frontend shell + spots
- [ ] App shell, routing, Tailwind tokens, spots store + favorites, dashboard
  spot cards, `about` page with attribution.
- [ ] ECharts wrapper, chart empty/loading/stale states.

**DoD:** `/` lists spots with current snapshots; navigation to empty spot
detail renders correct empty states.
**Verify:** e2e against recorded fixtures (no live upstream).

---

## M6 — Spot detail + map
- [ ] Wave/swell chart, tide curve, clarity card, surf-score strip, condition
  panel, provenance footer.
- [ ] MapLibre spot map with condition-driven colors.

**DoD:** spot detail fully functional for one spot of each type
(surf/dive/boat); map markers reflect condition colors.
**Verify:** manual QA of all three spot types; colorblind/accessibility check;
chart day-level zoom works.

---

## M7 — Hardening + deploy
- [ ] Rate limiting/retry/backoff, pre-warm cron, `/api/health`, error
  telemetry.
- [ ] Deploy (Node host + CDN); env-driven config; safety disclaimers.
- [ ] Pin/verify the `@mattnucc/gribberish` prebuilt binaries on the deploy host.

**DoD:** deployed site passes multi-user smoke (cache holds upstream calls near
constant).
**Verify:** load test (N concurrent users → upstream request count stays in the
tens).

---

## Risks & mitigations (summary)

| Risk | Mitigation |
|---|---|
| GRIB2 packing edge cases | Golden fixtures vs `wgrib2`; explicit unsupported-template errors |
| NOMADS endpoint churn (OPeNDAP deprecation) | Adapter isolation; audit at M0; Open-Meteo as dev cross-check |
| Visibility data is observed, not forecast | UI labeling + "asOf"; set expectations in `/about` |
| Open-Meteo non-commercial clause | Not used for v1 product data; dev-only cross-check |
| Upstream downtime | Stale-if-error + per-provider health + pre-warm |
| API contract drift | Contracts are the source of truth; contract tests with fixtures |