# Plan: dashboard activity toggle + information-first ordering

Refinement to the M4a dashboard (`plan-m4-dashboard.md`). Two owner requests:

1. **Separate surf and dive data.** The dashboard rendered both sections at
   once. Add a **Surf / Dive toggle** at the top so one activity is shown at a
   time.
2. **Rank by information, not the alphabet.** Spots were sorted A–Z after
   favorites. Prioritize spots that have data and deprioritize those we lack
   information for.

## Design

### Toggle (`/` route)

- Segmented control (`role="group"`, `aria-pressed` per button) in the
  dashboard control row, first item: `[Surf | Dive]`.
- Local page state (`activity`, default `surf`) — same treatment as the
  existing `query`/`favoritesOnly` filters, not a persisted preference.
- A spot is listed under an activity when `types` includes it. A spot that is
  both surf and dive appears in each view, but the toggle shows one view at a
  time so it is never duplicated on screen.
- The single `Surf spots` / `Dive spots` heading follows the active toggle.

### Information ranking (`lib/providers/overview.ts`)

- `spotInfoScore(spot)` — presence count (0–12) of the 9 snapshot fields plus
  `observedAt`, `clarityObservedAt`, and a non-empty tide preview. It is a
  presence count, not a quality judgement: a present-but-stale reading counts.
- `compareSpotsByInfo(a, b)` — highest score first, then `name` as the tiebreak.
- The page composes it as: favorites pin first, then `compareSpotsByInfo`.

## Definition of done

- [x] Toggle switches the dashboard between surf and dive spot sets.
- [x] Ordering is favorites → information score (desc) → name (asc).
- [x] `spotInfoScore` / `compareSpotsByInfo` unit-tested (`overview.spec.ts`).
- [x] `frontend.md` scope, pages table, and conventions updated.
- [x] `pnpm --filter web check && pnpm --filter web lint && pnpm --filter web test` green.
