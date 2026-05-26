---
"@confect/cli": patch
---

Externalize every bare-specifier dependency during codegen bundling instead of inlining third-party packages.

### Why

Since `9.0.0-next.0`, codegen bundles each `*.impl.ts` with esbuild so it can load the default-exported `Layer` and read the snapshotted function names from a `Finalized` `GroupImpl`. The bundler only marked `@confect/core`, `@confect/server`, `effect`, and `@effect/*` as external — every other dependency, including all of `node_modules` and every `node:*` built-in reached through inlined CJS source, was bundled into the output. With `format: "esm"`, esbuild rewrites any CJS `require(...)` in that inlined source to a runtime shim that throws `Dynamic require of "<id>" is not supported`, so any impl importing a third-party package (`sharp`, `luxon`, `@clerk/backend`, `jsonwebtoken`, `openai`, etc.) failed during `validateImpl`.

### What changed

- `@confect/cli/Bundler`'s `absoluteExternalsPlugin` now externalizes every bare specifier (anything not starting with `./`, `../`, or `/`), resolving each to an absolute file URL via the user's `node_modules`. `node:*` built-ins pass through unchanged.
- The `EXTERNAL_PACKAGES` allow-list is removed; relative imports continue to be bundled so the user's own source is still transpiled together.
- `@confect/cli/confect/dev` drops the redundant `external: EXTERNAL_PACKAGES` esbuild option — the plugin handles externalization for both codegen and dev-mode watchers.

### Fixes

This restores `confect codegen` for impls that import any non-`@confect/*` / `effect` / `@effect/*` library, fixing the regression introduced in `9.0.0-next.0`.
