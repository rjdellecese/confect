# `@confect/server` test deployment

This is the Convex deployment used by the local-backend end-to-end tests in
`packages/server/test/local-backend/`, **not** a template you should copy
from when starting a new Convex project.

The sibling `convex.json` points the Convex CLI at this directory via the
`functions` field, and the modules under `groups/` re-export the registered
functions produced by the Confect spec/impl tree under `../confect/`. The
`packages/server/test/local-backend/` suite spins up a real Convex local
backend against this deployment to exercise the reactive cache machinery.

This file exists so that the Convex CLI's first-run initialization
(`doInitConvexFolder`) finds a pre-existing `README.md` and skips writing
its default "Welcome to your Convex functions directory!" boilerplate, which
would otherwise leave the working tree dirty after every local-backend run.
