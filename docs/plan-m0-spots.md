# Plan — M0: Curate the seed spot list

**Priority item:** `todo-list.md` → Priority 0, second bullet ("Curate the seed
spot list"). Maps to `milestones.md` **M0** (spots half).

**Status:** ✅ implemented — 16 surf/dive spots seeded (the list was trimmed from
19 when the boating use case was dropped); `pnpm --filter web test/lint/check`
green.

## Problem

Every downstream provider adapter is keyed by spot: GFS-Wave samples an
`offshoreModelPoint`, CDIP/NDBC resolve a buoy, CO-OPS resolves a tide station,
and the surf score needs an `exposureDeg`. None of that exists yet — `apps/web/src/lib/spots/`
holds only a `.gitkeep`. Until a curated, station-linked spot list exists there
is nothing concrete for the adapter/cache seam (the next todo) to be built
against.

## Definition of done (from the todo list)

> the seed JSON exists with station IDs filled in.

Concretely: a seed file in `apps/web/src/lib/spots/` with ~10–20 SoCal spots
covering surf / dive, each with the `data-sources.md` spot model fully
populated (offshore model point, CDIP buoy, CO-OPS station, exposure), plus a
typed accessor and a cheap validation test so a bad edit fails CI rather than
surfacing as a blank chart.

## Spot data model (from `docs/data-sources.md`)

```jsonc
{
  "id": "la-jolla-shores",
  "name": "La Jolla Shores",
  "region": "san-diego",
  "lat": 32.8572, "lon": -117.2570,
  "types": ["surf", "dive"],
  "offshoreModelPoint": { "lat": 32.86, "lon": -117.40 },  // deep-water GFS-Wave sample
  "cdipBuoyId": "201",      // nearest CDIP buoy for "now" conditions
  "coopsStationId": "9410230", // tides / water level
  "exposureDeg": 265,       // open-ocean heading the spot faces (surf score)
  "favoriteSeed": true
}
```

## Files

```
apps/web/src/lib/spots/
  spots.json          # the curated seed (data only)
  index.ts            # Spot / SpotType types + loadSpots() + getSpot() lookups
  spots.spec.ts       # validation test (unique ids, coords, types, station IDs)
```

- `spots.json` is the deliverable; `index.ts` gives typed access for adapters and
  the frontend; `spots.spec.ts` is a cheap structural guard (matches the repo's
  "tests gate merges" rule without pretending to be a data audit).
- No UI, no `/api/spots` route, no providers — those are later todos.

## Seed list (16 surf/dive spots)

Coordinates are approximate anchors to be refined when a spot is first exercised
end to end. CDIP buoy IDs come from the real
`apps/web/fixtures/cdip/wave_agg.stations.json`; CO-OPS station IDs were verified
against the live NOAA CO-OPS metadata API. `exposureDeg` is the compass heading
of the open-ocean direction the spot faces (the azimuth of the swell it favors).

| id | name | region | types | offshore pt (lat, lon) | CDIP | CO-OPS |
|---|---|---|---|---|---|---|
| `la-jolla-shores` | La Jolla Shores | san-diego | surf, dive | 32.86, -117.40 | 201 | 9410230 |
| `la-jolla-cove` | La Jolla Cove | san-diego | dive | 32.86, -117.42 | 201 | 9410230 |
| `ocean-beach-sd` | Ocean Beach | san-diego | surf | 32.75, -117.42 | 191 | 9410170 |
| `imperial-beach` | Imperial Beach | san-diego | surf | 32.57, -117.33 | 218 | 9410120 |
| `huntington-beach` | Huntington Beach Pier | orange | surf | 33.63, -118.08 | 172 | 9410580 |
| `newport-wedge` | Newport Beach (The Wedge) | orange | surf | 33.59, -117.98 | 172 | 9410580 |
| `salt-creek` | Salt Creek (Dana Point) | orange | surf, dive | 33.46, -117.82 | 284 | 9410580 |
| `malibu-surfrider` | Malibu (Surfrider Beach) | los-angeles | surf | 34.03, -118.79 | 105 | 9410840 |
| `el-porto` | El Porto (Manhattan Beach) | los-angeles | surf | 33.89, -118.53 | 125 | 9410777 |
| `palos-verdes` | Palos Verdes (Lunada Bay) | los-angeles | surf, dive | 33.74, -118.58 | 213 | 9410738 |
| `san-pedro` | San Pedro (Point Fermin) | los-angeles | dive | 33.67, -118.42 | 092 | 9410660 |
| `ventura-c-street` | Ventura (C Street) | ventura | surf | 34.27, -119.43 | 169 | 9411189 |
| `rincon` | Rincon Point | ventura | surf | 34.34, -119.56 | 131 | 9411270 |
| `anacapa-island` | Anacapa Island | channel-islands | dive | 33.99, -119.43 | 212 | 9410971 |
| `catalina-avalon` | Avalon, Catalina Island | channel-islands | dive | 33.32, -118.42 | — | 9410079 |
| `santa-barbara` | Santa Barbara (Leadbetter) | santa-barbara | surf | 34.39, -119.80 | 090 | 9411340 |

Notes:
- `catalina-avalon` has no dedicated CDIP buoy; it is left null rather than
  borrowing a far-away island station (the observations service can fall back to
  NDBC or mainland buoys later).
- `favoriteSeed: true` on a handful (La Jolla Shores, Huntington, Malibu,
  Santa Barbara, Catalina) so the dashboard has sensible defaults.
- Types cover both use cases: surf, dive.
- Three boat-only harbor spots (`dana-point-harbor`, `long-beach`,
  `port-hueneme`) and the `boat` type were removed when boating left the product
  scope (see `frontend.md` → Scope); `san-pedro`, `anacapa-island`,
  `catalina-avalon`, and `santa-barbara` kept their surf/dive type.

## Validation test (`spots.spec.ts`)

Cheap structural checks only (not a data audit):
1. 10–20 spots; `id` unique and URL-safe.
2. every spot has 2–4 fixed-precision coords inside a broad SoCal bbox.
3. `types` non-empty and drawn from `surf | dive`.
4. every spot has a non-empty `offshoreModelPoint`.
5. `cdipBuoyId` (when present) is a 3-digit string; `coopsStationId` matches
   `/^941\d{4}$/`; `exposureDeg` (when present) is 0–359.

## Out of scope

- `GET /api/spots` endpoint and any UI — later frontend/API todos.
- Confirming every station is the *optimal* one (approximate anchors; refine
  per-spot during adapter integration).
- NDBC station IDs, bathymetry, sunrise/sunset.

## Verification

1. `pnpm --filter web test` → `spots.spec.ts` passes.
2. `pnpm lint && pnpm check` green.
3. Manual read: `spots.json` is valid JSON with station IDs filled in.

---

## Outcome

Shipped as planned: `spots.json` (now 16 surf/dive spots), `index.ts`
(`Spot`/`SpotType` + `loadSpots()`/`getSpot()`), and `spots.spec.ts`.
`resolveJsonModule` was enabled in `apps/web/tsconfig.json` so the seed can be
imported as typed JSON. The `.gitkeep` placeholder was removed. Minor deviation:
the lookup is named `getSpot()` rather than `byId()`.

**Later scope change:** boating left the product scope, so the seed was trimmed
from 19 to 16 spots — the three boat-only harbors were dropped, the `boat` type
was removed from the union, and the mixed spots kept their surf/dive types. The
plan above is kept in its original shape with this note rather than rewritten.

**Verification run (all green):** `pnpm --filter web test` ✅ (7 tests) ·
`pnpm --filter web check` ✅ (0 errors, 0 warnings) · `pnpm --filter web lint`
✅.
