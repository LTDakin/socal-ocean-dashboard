# `scratch/` — local-only workspace

A disposable, in-repo area for work that should **not** be committed. This
README is the only tracked file in here; everything else is ignored by git.

## What belongs here

- Working plans and design notes not ready to live in `docs/`.
- One-off or throwaway scripts, scratch SQL, debug snippets.
- Downloaded data, fixtures you're experimenting with, large samples.
- Personal, machine-specific runbooks (deploy steps, host details, secrets-free
  notes).

## Rules

1. **Nothing here is committed.** Treat the whole directory as disposable.
2. **Nothing here is backed up.** Ignored files are not in the repo, not in CI,
   and not recoverable from GitHub. Keep anything important elsewhere.
3. **Promote, don't hoard.** When something here becomes real, move it to its
   proper home and commit it there — e.g. plans to `docs/`, library code to
   `apps/web/src/lib/`, tests to the relevant `*.spec.ts`.
4. **Never put secrets here either.** It is ignored, but it also sits on disk
   inside the working tree, so it is easy to leak by accident. Use `.env`
   (also ignored) for real secrets.

## How the ignore works

`.gitignore` at the repo root contains:

```gitignore
scratch/*
!scratch/README.md
```

So every path under `scratch/` is ignored **except** this README. The directory
therefore stays present in the repo for anyone who clones it, while its contents
stay local.

## Useful commands

| Goal | Command |
| --- | --- |
| Confirm a path is ignored | `git check-ignore -v scratch/<path>` |
| See ignored files in here | `git status --ignored --short scratch/` |
| Check the README is *not* ignored | `git check-ignore scratch/README.md` → no output (exit 1 means not ignored) |
| Clear everything but this README | `find scratch -mindepth 1 ! -name README.md -delete` |

## Current contents

Deploy runbooks for the free hosting options:

- `plan-deploy-gcp-e2-micro.md` — Google Cloud `e2-micro` Always Free VM.
- `plan-deploy-oracle-always-free.md` — Oracle Cloud Always Free AMD micro VM.

Both target `x86_64` hosts so the `@mattnucc/gribberish` prebuilt native binary
loads without cross-compiling. See `docs/architecture.md` (§Deployment) for the
committed, generic version of this decision.
