# Repo Overview

Confect is a library that integrates Effect with the Convex backend platform. It is a pnpm monorepo (requires Node >= 22, pnpm >= 10).

## Package Dependency Graph

- `@confect/core` - Shared specs, schemas, and types (no workspace deps)
- `@confect/server` - Backend bindings to Convex (depends on core)
- `@confect/js` - Runtime-agnostic JavaScript client (depends on core)
- `@confect/react` - Client-side React hooks (depends on core)
- `@confect/cli` - CLI tooling for codegen and dev-mode watching (depends on core, server)
- `@confect/test` - Testing utilities via convex-test (depends on core, server)

## Apps

- `apps/example` - Vite + React example app demonstrating Confect usage
- `apps/docs` - Documentation site powered by Mintlify

## Tools

- `tools/bench-harness` - Private package that hands `@ark/attest` the TypeScript version the type benchmarks need; see its README

## TypeScript

The workspace is on TypeScript 7, so `tsc` is a native binary and the `typescript` package no longer exports a JavaScript compiler API — anything that needs to _drive_ the compiler rather than _run_ it has to either spawn `tsc` or use `typescript/unstable/*`. Effect's language service comes from `@effect/tsgo` (not `@effect/language-service`, which supports only TypeScript 5 and 6): the root `prepare` script runs `effect-tsgo patch --typescript`, which swaps in a `tsc` that also reports Effect diagnostics, so the `deterministicKeys: "error"` severity in `tsconfig.base.json` fails a build and not just an editor.

## Build System

Packages are built with tsdown (JavaScript output) plus TypeScript project references: each package has a composite `tsconfig.src.json`, and `tsc -b` typechecks the graph in dependency order and emits the `.d.ts` declarations (tsdown is configured with `dts: false`). The exception is `@confect/cli`, which ships only a binary: it has no `tsconfig.src.json` and emits no declarations; its build is tsdown-only and its sources are typechecked by the root `tsconfig.json`.

**Critical: packages must be rebuilt with `pnpm build` after source changes for those changes to be reflected outside their package directory.** Consumers import from `dist/`, not `src/`. During development, use `pnpm dev` to watch-rebuild all packages automatically: it runs tsdown in watch mode in every package (JavaScript output) alongside a single root `tsc -b --watch` over the project-reference graph (declaration output, in dependency order).

Build, lint, and format run through Vite+ (`vp`), which orders packages by their dependency graph and caches results. There are no per-package script variants at the root; target a single package ad hoc with `vp run --filter <pkg> <task>` (e.g. `vp run --filter @confect/core build`). Tests run through Vitest directly (not `vp`); target one package's suite with `vitest run --project @confect/core`.

### Key Commands (run from repo root)

- `pnpm build` - Build all @confect packages (cached, dependency-ordered)
- `pnpm dev` - Watch-rebuild all packages (tsdown watchers + `tsc -b --watch` for declarations)
- `pnpm dev:example` / `pnpm dev:docs` - Run the example app / docs site
- `pnpm test` - Run all package test suites via Vitest (`vitest run`)
- `pnpm typecheck` - Typecheck the package graph and test suites via `tsc -b` (project references, incremental)
- `pnpm lint` / `pnpm lint:fix` - Lint (Oxlint + Syncpack); `lint:fix` writes fixes
- `pnpm format` / `pnpm format:check` - Format (Oxfmt + Syncpack); `format` writes, `format:check` only checks
- `pnpm check` - Format, lint, and type checks together (`vp check`)
- `pnpm clean` - Remove dist, coverage, and node_modules everywhere

## Testing

Tests use Vitest with a root-level `vitest.config.ts` (which uses `projects: ["packages/*"]` to discover per-package test projects) and shared config in `vitest.shared.ts`. The core, js, react, server, and cli packages all have tests. The @confect/server package has integration tests using convex-test.

Tests import the public package specifiers (e.g. `@confect/core/Ref`); `vitest.shared.ts` aliases those to each package's `src/` so suites run against source rather than built `dist/`.

Run `pnpm test` to run all suites at once, or target a single package with `vitest run --project @confect/<pkg>` (e.g. `vitest run --project @confect/core`). Run tests with `vitest run`, not `vp test` — the Vite+ test runner mishandles type-only test files. The server's Convex integration suites have dedicated scripts: `pnpm test:server:mock-backend` and `pnpm test:server:local-backend`.

## Versioning and Publishing

All @confect packages are in a fixed version group via Changesets, meaning they are always versioned and released together. Use `pnpm changeset` to create a changeset before merging a PR with user-facing changes.

## Capy-specific instructions

### Running the example app

The example app is in `apps/example`. To start it:

```bash
cd apps/example
pnpm dev
```

This runs Vite, the Convex local backend, and the Confect codegen watcher concurrently.

#### Convex environment variables

The Convex local backend requires certain environment variables. After starting the dev server for the first time (so the local backend is initialized), set them from the checked-in defaults file:

```bash
cd apps/example
pnpm convex env set < .env.defaults
```

This bulk-sets all variables from `.env.defaults` (added in convex 1.33.0). The values are stored in the local backend's state (`.convex/`) and persist across restarts, but not across fresh clones or environment resets.

#### Ports

The example app uses three local ports, all accessible from the browser:

- **5173**: Vite dev server (frontend)
- **3210**: Convex backend (WebSocket sync, used by `VITE_CONVEX_URL`)
- **3211**: Convex HTTP actions server (used by `VITE_CONVEX_SITE_URL`)

## Code and review invariants

### Schema laziness must be preserved

`@confect/core` exposes function and table schemas lazily so that importing the
codegen-assembled `_generated/spec.ts` — which transitively references every
function in the project — builds **no** schemas at module load. Breaking this
silently inflates every function's cold-start cost with the size of the whole
project; no type error or lint catches it.

Treat any change under `packages/core/src/` or `packages/server/src/` that
breaks either rule as a high-severity defect:

1. **No eager construction.** `FunctionSpec.*` takes `args` / `returns` /
   `error` as `() => Schema` thunks, and `Table.make` takes `() => Fields`;
   both expose the result as lazy memoised getters. Constructing a
   `FunctionSpec` or `Table`, or assembling a `Spec`, must never evaluate a
   schema thunk. Do not pass an already-built schema where a thunk is expected,
   or read `.args` / `.returns` / `.error` / `Doc` / `tableDefinition` at
   construction- or assembly-time.
2. **Presence without forcing.** Code that only needs to know _whether_ an
   optional `error` schema exists must use a key-presence check
   (`"error" in functionProvenance`), never read `.error` — reading it
   force-builds the schema. Do not switch from `"error" in fp` back to
   `fp.error !== undefined`, or read `.error` purely as an existence test. See
   `Ref.hasErrorSchema` / `Ref.decodeError`.

### Per-function bundle isolation must be preserved

The v9 codegen split implementation and schema modules across the filesystem so
that a single Convex function's cold-start bundle scales with its own group, not
the whole project. This is invisible to types, lint, and most tests — a stray
import in a codegen template silently regresses every function's bundle.

Treat any change, chiefly in `packages/cli/src/templates.ts`, generated
`_generated/` layouts, or `packages/server/src/`, that breaks either rule as a
high-severity defect:

1. **One group per bundle.** A generated `convex/{path}.ts` must import only its
   own `_generated/registeredFunctions/{path}` module, and each
   `_generated/registeredFunctions/{path}.ts` must import only its own sibling
   `{path}.impl`. Do not reintroduce an aggregate registry such as
   `_generated/registeredFunctions.ts` or add a cross-group import that pulls
   one group's `.impl` into another group's bundle.
2. **Deploy schema stays out of the runtime bundle.** `_generated/schema.ts`
   (the runtime `DatabaseSchema`) must import `@confect/server` and never
   `convex/server`; `_generated/convexSchema.ts` (the deploy
   `SchemaDefinition`) must import `convex/server`'s `defineSchema` and never
   `@confect/server`. Do not make a function bundle reach `convex/server`'s
   `defineSchema` or merge the two schema artifacts back into one module.

### Spec, group, and table builders stay pure

`Spec`, `GroupSpec`, and `Table` builder methods (`add` / `addAt` /
`addGroupAt` / `addFunction` / `withName` / `make`, etc.) must be immutable:
return a fresh value, never mutate their argument or `this`, and perform no side
effects at module load. Treat any builder that mutates an input or `this` in
place, relies on that mutation for object identity, or runs side effects when a
`*.spec.ts` / `confect/tables/*.ts` module is merely imported as a high-severity
defect.

Before reporting an invariant violation, cite the specific `file:line` where
the eager thunk evaluation, cross-group or `convex/server` import, or in-place
mutation occurs. Do not infer a violation from naming alone.

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package (e.g., npx opensrc zod)
npx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
npx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
npx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```

<!-- opensrc:end -->
