# Todo List — So-cal Ocean Dashboard

Lean MVP build order, dependency-first. We assume upstream APIs, dataset IDs, and
the GRIB2 library (`@mattnucc/gribberish`) behave as documented — so there is no
separate data-audit gate and no library-hardening task. Validation is scoped to
what's needed to trust a number on screen, not exhaustive golden/contract
coverage. Detailed steps live in `docs/milestones.md`; this file is the running
priority order.

Markers: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Priority 0 — Foundations

- [x] **Scaffold the monorepo & developer tooling.**
  pnpm workspaces, `apps/web`, SvelteKit 3 + Tailwind v4, TS strict,
  lint/format/type-check, vitest, and CI on Node LTS. `packages/grib2` was
  dropped at M0 in favour of `@mattnucc/gribberish`. ✅

- [x] **Curate the seed spot list.**
  ~10–20 SoCal spots spanning surf/dive/boat with the spot model from
  `data-sources.md` (offshore model point, buoy/station linkage, exposure).
  *Done when:* the seed JSON exists with station IDs filled in. ✅
  (19 spots in `apps/web/src/lib/spots/spots.json`.)

- [x] **Build the provider adapter interface + cache foundation (BFF core).**
  The shared `getSpotData(spot, window) -> normalized bundle` contract, the TTL
  cache keyed `provider:spotId:window`, and the response envelope
  (`ok/asOf/stale/sources`). One stub adapter exercises it end to end.
  *Done when:* the stub adapter returns a bundle through cache. ✅
  (`lib/providers` + `lib/cache`; see `docs/plan-m0-providers.md`.)

---

## Priority 1 — Core data engine (the base of the product)

- [x] **Integrate GRIB2 decoding (`@mattnucc/gribberish`).**
  Wrap the Node bindings behind `apps/web/src/lib/grib2`: fetch a NOMADS subset
  (or a single field via `.idx` Range) → typed fields with `validTime`, plus a
  small field-index / `inspect` helper. ✅
  *Done when:* one real GFS-Wave subset decodes to the expected fields.
  (`HTSGW` = 0.95 m at La Jolla in both fixtures; see `docs/plan-m1-grib2.md`.)

- [x] **Build the GFS-Wave provider + forecast service.**
  Adapter fetches per-cycle region subsets, scans fields, and emits the hourly +
  daily forecast contract with provenance (`modelRun`, `asOf`), TTL cache, and
  stale-if-error. ✅
  *Done when:* one live SoCal spot returns a full ~14-day forecast through the
  BFF. (`GET /api/spot/[id]/forecast`; live-verified against NOMADS. See
  `docs/plan-m2-gfswave.md`.)

- [x] **Build the derived-metrics service (`lib/derive`).**
  Daily aggregations, Secchi rating bands, and the surf score, kept separate from
  raw adapters so they can be reasoned about in isolation. ✅
  *Done when:* a fixture yields a deterministic score and ratings.
  (`lib/derive/daily.ts`, `clarity.ts`, `surf-score.ts`; see
  `docs/plan-m2-derive.md`.)

---

## Priority 2 — Auxiliary observation services

- [x] **Build the tides service.**
  CO-OPS adapter (predictions + water level) and the `tides` endpoint over the
  forecast window. ✅
  *Done when:* an MLLW curve renders for a spot.
  (`coops` adapter + `GET /api/spot/[id]/tides`; fixture-backed, live-verified.
  See `docs/plan-m3-tides.md`. Water level belongs to the observations service.)

- [ ] **Build the real-time observations service.**
  CDIP buoy obs (IOOS ERDDAP JSON) + NDBC gap-fill, merged with tide/clarity into
  the `current` endpoint with per-field provenance.
  *Done when:* `current` returns genuine "now" values.

- [ ] **Build the clarity service.**
  CoastWatch VIIRS Kd490 adapter (daily, ~24 h TTL) and the `clarity` endpoint,
  labeled "observed, not forecast".
  *Done when:* a spot shows observed clarity + rating + `asOf`.

---

## Priority 3 — Frontend (after the data contracts are stable)

- [ ] **Build the app shell + dashboard.**
  Routing, Tailwind tokens, spots store + local favorites, dashboard `SpotCard`
  list, shared ECharts wrapper, and empty/loading/stale states.
  *Done when:* `/` lists spots with current snapshots.

- [ ] **Build the spot detail experience.**
  Wave/swell chart, tide curve, clarity card, surf-score strip, conditions panel,
  and the provenance footer — one spot of each type.
  *Done when:* detail works for surf/dive/boat spots.

- [ ] **Add attribution + disclaimers.**
  Data credits per `data-sources.md` and safety disclaimers, surfaced in the app
  footer (minimal about page).
  *Done when:* attribution and disclaimers are visible.

---

## Priority 4 — Ship

- [ ] **Deploy the MVP.**
  Node adapter host + CDN, env-driven config.
  *Done when:* the deployed site serves a working dashboard and spot detail.

---

## Deferred (post-MVP)

Not needed to validate the MVP; revisit once the core loop is live.

- MapLibre spot map with condition-driven colors.
- Full about / methodology page.
- Resilience layer: rate limiting, retry/backoff, pre-warm cron, error telemetry.
- Pinning/verifying `@mattnucc/gribberish` prebuilt binaries on the deploy host.
- Contract/golden test coverage beyond the minimum to trust a value.

---

## Guiding order (why this sequence)

1. **Adapter/cache seam before providers** — every provider plugs into one
   interface, so adding sources stays mechanical.
2. **Decode before the wave adapter** — the forecast is the product.
3. **Data contracts before UI** — the frontend is a pure consumer of the
   envelope.
4. **Ship the core loop, add polish later** — map, hardening, and exhaustive
   tests are deferred.
