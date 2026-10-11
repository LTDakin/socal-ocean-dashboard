# Plan — M4c: attribution, disclaimers & the about page

Priority 3, third bullet of `todo-list.md` (*"Build the about / methodology
page"*) and the matching milestone item in `docs/milestones.md` (*"Attribution +
safety disclaimers in the app footer (minimal about page)"*).

**Done when:** the app footer credits every upstream source and carries the
safety disclaimer, and `/about` is a quick-to-scan but comprehensive
methodology + credits page that the footer links to.

## Scope

The data contracts are frozen and the dashboard/detail pages consume them, so
this pass is **frontend-only copy + structure**. Three things:

1. **One source of truth for credits.** New `lib/attribution` module holding
   the upstream-source credits (name, org, dataset, URL, license, the envelope
   provider ids it covers), the software credits, and the safety disclaimer.
   The footer, `/about`, and the spot provenance footer all read from it so the
   copy can't drift (`docs/data-sources.md`, `docs/frontend.md` → `/about`).
2. **Real footer attribution.** Replace the placeholder footer
   (`plan-m4-dashboard.md` named it as this todo) with the source roll-up +
   disclaimer + a link to `/about`; reuse the shared disclaimer in
   `ProvenanceFooter`.
3. **`/about` page.** A short "what you're looking at" plus per-metric
   methodology (waves, tides, observations, clarity/visibility, surf score),
   the credit table with links, the software list, and a prominent safety
   disclaimer. Aimed at the surf/dive audience: scannable headings, honest
   caveats (observed-not-forecast, satellite latency, cloud gaps, stale data).

No backend or contract changes.

## Verification

- `pnpm test` — new `attribution.spec.ts`: provider ids are unique and cover
  every registered adapter id; the disclaimer/summary helpers are non-empty.
- `pnpm check && pnpm lint && pnpm build` green.
- Manual: `pnpm dev`, `/about` renders all sections and source links; every
  page's footer shows the credits + disclaimer and links to `/about`.
