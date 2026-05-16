# `@confect/server` test deployment

This is the Convex deployment used by `@confect/server`'s tests, **not** a
template you should copy from when starting a new Convex project.

`packages/server/convex.json` points the Convex CLI at this directory via the
`functions` field, and the modules under `groups/`, `node/`, and
`databaseReader.ts` re-export the registered functions produced by the
Confect spec/impl tree under `../confect/`. The
`packages/server/test/end-to-end/` suite spins up a real Convex local backend
against this same deployment to exercise the reactive cache machinery; the
in-process tests in `packages/server/test/integration.test.ts` use the same
fixtures via `convex-test`.

This file exists so that the Convex CLI's first-run initialization
(`doInitConvexFolder`) finds a pre-existing `README.md` and skips writing
its default "Welcome to your Convex functions directory!" boilerplate, which
would otherwise leave the working tree dirty after every end-to-end run.
