# Capy repository instructions

- Never read `.env.local` files.
- Do not inspect dependency source in `node_modules`, `.pnpm-store`, or `.pnpm`. Run `pnpm opensrc path <package-name>` and inspect the returned source path instead. Cached package versions are listed in `~/.opensrc/sources.json`.
- After editing a file type supported by Oxfmt, run `pnpm oxfmt --write <file>` on the edited file.
- After editing JavaScript or TypeScript, run `pnpm oxlint --fix <file>` on the edited file and report any remaining diagnostics.
- Read `REVIEW.md` when reviewing changes; its schema laziness, bundle isolation, and builder purity invariants also apply during implementation.

## Agent configuration

`AGENTS.md` is the canonical repository guidance. Keep reusable workflows in
`.agents/skills/<name>/SKILL.md`; invoke them by skill name in Capy rather than
maintaining separate agent-specific commands or copies of the instructions.
Use the project's pull request creation tool for new PRs so checks and review
feedback return to the originating thread. Never merge without an explicit
request from the user.

Capy Setup, Automations, and MCP registrations live in the Capy project.
Do not configure tool hooks; follow the formatting, linting, and read-safety
instructions above directly.

# Repo Overview

Confect is a library that integrates Effect with the Convex backend platform. It is a pnpm monorepo (requires Node >= 22, pnpm >= 10).

## Package Dependency Graph

- `@confect/core` - Shared specs, schemas, and types (no workspace deps)
- `@confect/server` - Backend bindings to Convex (depends on core)
- `@confect/js` - Runtime-agnostic JavaScript client (depends on core)
- `@confect/foldkit` - Client-side bindings for Foldkit apps (depends on core, js)
- `@confect/react` - Client-side React hooks (depends on core)
- `@confect/cli` - CLI tooling for codegen and dev-mode watching (depends on core, server)
- `@confect/test` - Testing utilities via convex-test (depends on core, server)

## Apps

- `apps/example` - Vite + React example app demonstrating Confect usage
- `apps/docs` - Documentation site powered by Mintlify

## Tools

- `tools/bench-harness` - Private package that hands `@ark/attest` the TypeScript version the type benchmarks need; see its README

## TypeScript

The workspace is on TypeScript 7, so `tsc` is a native binary and the `typescript` package no longer exports a JavaScript compiler API — anything that needs to _drive_ the compiler rather than _run_ it has to either spawn `tsc` or use `typescript/unstable/*`. Effect's language service comes from `@effect/tsgo` (not `@effect/language-service`, which supports only TypeScript 5 and 6): the root `prepare` script patches both TypeScript and Oxlint. TypeScript provides Effect editor features with duplicate diagnostics disabled, while Oxlint reports Effect diagnostics through the `effecttsgo` plugin; configure their severities in `.oxlintrc.json`.

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

Tests use Vitest with a root-level `vitest.config.ts` (which uses `projects: ["packages/*"]` to discover per-package test projects) and shared config in `vitest.shared.ts`. The core, foldkit, js, react, server, and cli packages all have tests. The @confect/server package has integration tests using convex-test.

Tests import the public package specifiers (e.g. `@confect/core/Ref`); `vitest.shared.ts` aliases those to each package's `src/` so suites run against source rather than built `dist/`.

### Test organization

- **Keep unit tests per-module.** Use `packages/<package>/test/<Module>.test.ts` for a source module's public contract, and extend the existing suite when adding functionality. Do not introduce feature-named root suites such as `MiddlewareOptions.test.ts` when the feature spans several existing modules.
- **Split feature coverage by ownership.** Put attachment typing and builder behavior in the relevant spec module's suite, schema equivalence in the module that validates it, ref propagation in `Ref`/`Refs`, and implementation typing or registration checks in their server module suites. A unit test may construct inputs with other modules; its assertions should target the owning module's contract.
- **Use the existing backend integration suites for runtime flows.** Tests that invoke backend functions or verify middleware execution order, service propagation, and client error decoding belong under `packages/server/test/mock-backend/`, or `test/local-backend/` when a real Convex backend is required. Extend the relevant topic suite, such as `mock-backend/middleware.test.ts`, and reuse the existing test harness and fixtures rather than adding a parallel setup in the unit-test directory.
- **Make new integration conventions explicit.** If another package needs integration coverage that does not fit an existing suite, document its integration-test location and configure test discovery explicitly rather than silently introducing feature-named integration suites among per-module unit tests.
- **Preserve coverage when reorganizing tests.** Relocate both runtime assertions and type assertions, including negative `@ts-expect-error` cases. Split mixed tests where necessary so each assertion has a clear owner, then run the affected unit and integration suites plus the repository typecheck.

### Running tests

Run `pnpm test` to run all suites at once, or target a single package with `vitest run --project @confect/<pkg>` (e.g. `vitest run --project @confect/core`). Run tests with `vitest run`, not `vp test` — the Vite+ test runner mishandles type-only test files. The server's Convex integration suites have dedicated scripts: `pnpm test:server:mock-backend` and `pnpm test:server:local-backend`.

## Versioning and Publishing

All @confect packages are in a fixed version group via Changesets, meaning they are always versioned and released together. Use `pnpm changeset` to create a changeset before merging a PR with user-facing changes.

## Capy development environment

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
