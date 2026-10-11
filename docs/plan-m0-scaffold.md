# Plan — M0a: Scaffold the monorepo & developer tooling

**Priority item:** `todo-list.md` → Priority 0, first bullet ("Scaffold the
monorepo & developer tooling"). Maps to `milestones.md` **M0** (scaffold half).

**Status:** ✅ implemented (M0a) — `pnpm lint / check / test / build` green; dev
server boots. Approved with **"Ready to Code"**.

## Problem

The repository is docs-only. There is no code, no package manager config, no
tooling, and no CI. Nothing downstream (GRIB2 codec, adapters, frontend) can be
built or trusted until a green, repeatable workspace exists.

## Definition of done (from the todo list)

> `pnpm test/lint/build` is green from a clean clone.

Concretely: `packages/grib2` and `apps/web` are pnpm-workspace members, TypeScript
is strict, lint/format/vitest are wired, CI runs on Node LTS, and each package
ships one trivial passing test.

## Relevant files (all new — nothing exists yet)

```
pnpm-workspace.yaml
package.json                 (private root, workspace scripts)
tsconfig.base.json
eslint.config.js
.prettierrc.json
.gitignore
.nvmrc
.github/workflows/ci.yml
packages/grib2/
  package.json               (name tbd, license MIT, zero runtime deps)
  tsconfig.json
  src/index.ts               (placeholder public API)
  test/index.test.ts         (trivial passing test)
  LICENSE                    (MIT)
  README.md
  CONTRIBUTING.md
apps/web/
  package.json
  svelte.config.js, vite.config.ts, tsconfig.json
  src/routes/+page.svelte    (empty shell)
  src/lib/{providers,cache,derive,spots,components}/.gitkeep
  src/lib/index.test.ts      (trivial passing test)
  (Tailwind config + app.css)
```

## Proposed steps

1. **Root workspace.** Add `pnpm-workspace.yaml` (`packages: [packages/*, apps/*]`),
   a private root `package.json` with `packageManager` pinned to a pnpm major and
   convenience scripts (`lint`/`test`/`build` fanning out with `pnpm -r`), `.nvmrc`
   (Node LTS), `.gitignore`, and a `.npmrc` if needed for workspace hoisting.
2. **Shared TS config.** `tsconfig.base.json` with `strict: true`, `module`/`target`
   set for a modern Node + bundler setup; both packages `extends` it.
3. **Lint/format.** ESLint flat config (`typescript-eslint` + svelte plugin) and
   Prettier, with `lint`/`format` scripts at the root.
4. **`packages/grib2` placeholder.** `package.json` (MIT, zero runtime deps,
   `exports`/`types`), `src/index.ts` exporting a single placeholder symbol and a
   typed stub for the eventual `readFields`/`inspect` API, one vitest test that
   passes, plus `LICENSE` (MIT), `README.md`, `CONTRIBUTING.md` (keeps the package
   extractable from day one per `AGENTS.md` rule 5–7).
5. **`apps/web` SvelteKit scaffold.** Generate a minimal SvelteKit + TypeScript
   app (Svelte 5), add Tailwind with a small token layer, wire vitest with one
   trivial test, and create the empty `lib/` adapter/cache/derive/spots/components
   directories so the structure in `architecture.md` exists.
6. **CI.** `.github/workflows/ci.yml`: Node LTS + pnpm (cached), run
   `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`, `pnpm build`.
7. **Lockfile + green check.** Install, commit `pnpm-lock.yaml`, and confirm all
   three commands are green locally.

## Decisions & tradeoffs

- **Tailwind v4 vs v3.** v4 (CSS-first, faster) is current, but v3 has more
  battle-tested Svelte community setup. Proposal: v4 unless you object.
- **Vitest workspace.** One vitest config at the root driving both packages keeps
  CI simple; per-package configs are more isolated. Proposal: root-level run via
  `pnpm -r test`, each package owning its own vitest config.
- **pnpm version pin.** `packageManager` field locks the version so CI and local
  match. Proposal: pnpm 9.x + `corepack`.
- **`git init`.** The directory is **not** a git repo and `git --version` works,
  so CI cannot actually run until it is one. Proposal: `git init` + initial commit
  as part of this item (Conventional Commits per `AGENTS.md` rule 6).
- **Environment note.** `pnpm` is not currently installed on this machine; step 7
  requires enabling it (likely `corepack enable pnpm`), which I'll ask permission
  for at run time.

## Build vs. buy: the GRIB2 codec (affects whether `packages/grib2` exists)

Owner asked to check for an existing library before scaffolding the in-house
codec. Findings (checked Oct 2026):

| Option | License | Impl | Health | Notes |
|---|---|---|---|---|
| **`@mattnucc/gribberish`** | MIT | Rust core, N-API + WASM | v1.7.0 (Aug 2026), 76★, CI Node 20/22/24 | Zero runtime deps; **prebuilt binaries** (Rust toolchain not needed); GRIB1/2; `png` + JPEG2000 packing on by default; parses wgrib2 `.idx` + ECMWF `.index` sidecars → **single-field HTTP Range fetch** (matches our NOMADS adapter design). |
| `vgrib2` | MIT | pure TS | last publish Oct 2022, 5★ | Abandoned; table/template coverage incomplete. |
| `grib2-simple` | MIT | plain JS | last publish 2018 | DWD/COSMO-only, dead. |
| `eccodes-lib` | Apache-2.0 | native ecCodes `.so` | 8 yrs old, Ubuntu-only | Platform-locked. |

**Decision pending owner.** This contradicts planned decision #4 in
`architecture.md` / all of `grib2-library.md` (pure-TS, zero-dep, extractable
in-house codec). If we adopt `gribberish`:

- `packages/grib2` is **dropped** from the scaffold.
- A thin app-level seam (`apps/web/src/lib/grib2`) wraps `gribberish` so provider
  adapters never import it directly (keeps adapters swappable; preserves the
  option to swap in an in-house codec or contribute upstream later).
- All GRIB2 open-source/extraction milestones (M7 / `grib2-library.md`
  checklist) become moot.

If we stay in-house, the scaffold proceeds exactly as described above.

## Out of scope (sibling Priority-0 items, not this item)

- The data audit (exact NOMADS/CDIP/CoastWatch/CO-OPS endpoints) — its own todo.
- The seed spot list — its own todo.
- The provider adapter interface + cache foundation — its own todo.

## Verification (how you'll know it's done)

1. `corepack enable pnpm && pnpm install` from a clean clone succeeds.
2. `pnpm lint` → clean; `pnpm test` → all trivial tests pass; `pnpm build` → green.
3. `pnpm --filter web dev` boots the empty app at `http://localhost:5173`.
4. `pnpm --filter <grib2-package> test` runs the placeholder test in isolation.
5. Push triggers the CI workflow, which passes on Node LTS.

## Decisions (resolved) & outcome

- **GRIB2:** adopt `@mattnucc/gribberish`; drop `packages/grib2` (see build-vs-buy
  section above). Seam lives at `apps/web/src/lib/grib2`.
- **Tailwind:** v4 (CSS-first, `@tailwindcss/vite`).
- **git:** initialized, branch `main`, initial commit of the scaffold.
- **`git init` + Conventional Commits** per `AGENTS.md` rule 6.

**Deviations from the original plan (all deliberate):**
- No root `tsconfig.base.json`: the single app extends SvelteKit's generated
  `$app/tsconfig` (already `strict`), so a shared base would be dead config.
  Add one if/when a second workspace package appears.
- Tooling (ESLint/Prettier/Vitest) is configured per-package
  (`apps/web/`) rather than at the root; root scripts fan out with `pnpm -r`.
- One workspace member (`apps/web`) instead of two, since `packages/grib2` was
  dropped. `pnpm-workspace.yaml` still globs `packages/*` for future packages.
- Node adapter (`@sveltejs/adapter-node`) chosen now so `pnpm build` works
  locally without a platform-detecting adapter.

**Verification run (all green):** `pnpm lint` ✅ · `pnpm check` ✅ (0 errors,
0 warnings) · `pnpm test` ✅ (1 passed) · `pnpm build` ✅ · `pnpm dev` → HTTP 200.
