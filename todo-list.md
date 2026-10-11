# Todo List — So-cal Ocean Dashboard

High-level build items, ordered dependency-first and prioritized so the
foundations exist, are tested, and stay stable before higher layers are built on
them. Each item is a **deliverable/service**, not a checklist of code steps.
Detailed step-level tasks live in `docs/milestones.md`; this file is the
running priority order.

Markers: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Priority 0 — Foundations (nothing else is trustworthy until these exist)

- [x] **Scaffold the monorepo & developer tooling.**
  pnpm workspaces, `apps/web`, SvelteKit 3 + Tailwind v4, TS strict,
  lint/format/type-check, vitest, and CI on Node LTS. `packages/grib2` was
  dropped at M0 in favour of `@mattnucc/gribberish` (see `architecture.md`).
  *Done when:* `pnpm test/lint/build` is green from a clean clone. ✅

- [ ] **Complete the data audit (blocking gate).**
  Confirm and record exact NOMADS Grib Filter URLs/dirs + a real GFS-Wave
  fixture, CDIP ERDDAP dataset IDs, CoastWatch NRT Kd490 dataset, and CO-OPS
  station IDs for the first spots. Update `docs/data-sources.md`.
  *Done when:* every URL/dataset ID is confirmed and one fixture is committed.
  *Why first:* every adapter depends on it; guessing here poisons everything.

- [ ] **Curate the seed spot list.**
  ~10–20 SoCal spots spanning surf/dive/boat with the spot model from
  `data-sources.md` (offshore model point, buoy/station linkage, exposure).
  *Done when:* the seed JSON exists and every spot links to confirmed stations.

- [ ] **Build the provider adapter interface + cache foundation (BFF core).**
  The shared `getSpotData(spot, window) -> normalized bundle` contract, the TTL
  cache keyed `provider:spotId:window`, and the response envelope
  (`ok/asOf/stale/sources`). No real providers yet — one stub adapter exercises
  it end to end.
  *Done when:* the stub adapter returns a contract-valid bundle through cache,
  with tests. Everything above builds on this seam.

---

## Priority 1 — Core data engine (the base of the product)

- [ ] **Integrate GRIB2 decoding (`@mattnucc/gribberish`).**
  Wrap the MIT-licensed Node bindings behind `apps/web/src/lib/grib2` (fetch a
  NOMADS subset, or a single field via `.idx` Range → typed fields, time axis →
  `validTime`), plus a small field-index / `inspect` helper.
  *Done when:* decodes the audited GFS-Wave fixture matching `wgrib2`; golden
  test passes; unsupported templates surface clearly (never silent NaN).

- [ ] **Build the GFS-Wave provider + forecast service.**
  Adapter fetches per-cycle region subsets, scans fields via the codec, and
  emits the hourly + daily forecast contract with provenance (`modelRun`,
  `asOf`), TTL cache, and stale-if-error.
  *Done when:* one live SoCal spot returns a full ~14-day forecast through the
  BFF; a second request in TTL hits cache; values sanity-check vs Open-Meteo.

- [ ] **Build the derived-metrics service (`lib/derive`).**
  Daily aggregations, Secchi rating bands, and the experimental surf score
  (units-tested, deterministic, config-respecting). Kept separate from raw
  adapters so it can be tested in isolation.
  *Done when:* unit-tested thresholds and a deterministic score for fixtures.

---

## Priority 2 — Auxiliary observation services (fill out the data surface)

- [ ] **Build the tides service.**
  CO-OPS adapter (predictions + water level) and the `tides` endpoint over the
  forecast window.
  *Done when:* a correct MLLW curve renders for a spot; cross-checked vs CO-OPS
  web output.

- [ ] **Build the real-time observations service.**
  CDIP buoy obs (IOOS ERDDAP JSON) + NDBC gap-fill, merged with tide/clarity
  into the `current` endpoint with per-field provenance.
  *Done when:* `current` returns genuine "now" values merged with provenance.

- [ ] **Build the clarity service.**
  CoastWatch VIIRS Kd490 adapter (daily, ~24 h TTL) and the `clarity` endpoint
  with explicit cloud-gap/latency handling and "observed, not forecast"
  labeling.
  *Done when:* a spot shows observed clarity + rating + `asOf`.

---

## Priority 3 — Frontend (only after the data contracts are stable)

- [ ] **Build the app shell + dashboard.**
  Routing, Tailwind design tokens, spots store + local favorites, dashboard
  `SpotCard` list, shared ECharts wrapper, and empty/loading/stale states.
  *Done when:* `/` lists spots with current snapshots from fixtures; e2e passes
  with no live upstream.

- [ ] **Build the spot detail experience.**
  Wave/swell chart, tide curve, clarity card, surf-score strip, conditions
  panel, and the provenance footer. Covers one spot of each type.
  *Done when:* detail is fully functional for surf/dive/boat spots.

- [ ] **Build the map.**
  MapLibre spot map with condition-driven, colorblind-safe colors and
  click-through to detail.
  *Done when:* markers reflect a chosen condition; accessibility check passes.

- [ ] **Build the about / methodology page.**
  Method, data credits/attribution, and safety disclaimers.
  *Done when:* attribution and disclaimers match `data-sources.md`.

---

## Priority 4 — Hardening, deploy, and extraction (last, depends on all above)

- [ ] **Build the resilience layer.**
  Rate limiting, retry/backoff, pre-warm cron, `/api/health`, and error
  telemetry.
  *Done when:* load test shows upstream call counts stay near-constant.

- [ ] **Build the deployment pipeline.**
  Node adapter host + CDN, env-driven config, safety disclaimers live.
  *Done when:* deployed site passes a multi-user smoke test.

- [ ] **Harden the GRIB2 dependency.**
  Pin `@mattnucc/gribberish` (exact version), confirm its prebuilt binaries work
  on the deploy host, and record a fallback plan if it goes unmaintained.
  *Done when:* the version is pinned, deploy-host binaries verified, and the
  fallback noted in `architecture.md`.

---

## Guiding order (why this sequence)

1. **Tooling + audit before any code** — the plan's whole risk story rests on
   confirmed upstream endpoints and a green CI.
2. **Adapter/cache seam before providers** — every provider plugs into one
   tested interface, so adding sources is mechanical and testable.
3. **Decode before the wave adapter** — the forecast is the product; it can't be
   built on unverified binary decoding.
4. **Data contracts before UI** — the frontend is a pure consumer of the
   envelope; building it early just churns against unstable shapes.
5. **Hardening + deploy + extraction last** — they depend on the surface being
   complete and stable.
