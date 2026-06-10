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

## Build System

Packages are built with tsdown (JavaScript output) plus TypeScript project references: each package has a composite `tsconfig.src.json`, and `tsc -b` typechecks the graph in dependency order and emits the `.d.ts` declarations (tsdown is configured with `dts: false`).

**Critical: packages must be rebuilt with `pnpm build` after source changes for those changes to be reflected outside their package directory.** Consumers import from `dist/`, not `src/`. During development, use `pnpm dev` to run tsdown in watch mode across all packages so rebuilds happen automatically.

Build, lint, and format run through Vite+ (`vp`), which orders packages by their dependency graph and caches results. There are no per-package script variants at the root; target a single package ad hoc with `vp run --filter <pkg> <task>` (e.g. `vp run --filter @confect/core build`). Tests run through Vitest directly (not `vp`); target one package's suite with `vitest run --project @confect/core`.

### Key Commands (run from repo root)

- `pnpm build` - Build all @confect packages (cached, dependency-ordered)
- `pnpm dev` - Watch-rebuild all packages in parallel
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

## Cursor Cloud specific instructions

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
