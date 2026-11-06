# Capy repository instructions

- Never read `.env.local` files.
- Treat library inputs as immutable by convention. Do not defensively copy or freeze them to guard against caller mutation; library operations must also preserve their inputs.
- Keep a functional core and an imperative shell. Return named, tagged errors with structured payloads from fallible core operations (for example, in `Result`); let boundary code decide whether to fail, die, or throw. Do not use generic `Error` values for modeled failures.
- Document stream-query APIs through `QueryStream`. Other `QueryStream*` modules are internal and undocumented; explain their concepts only when useful to readers.
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

- `tools/bench-harness` - Private package that runs `@ark/attest` type benchmarks on tsrs; see its README
- `tools/local-backend` - Private shared Convex backend harness, fixtures, and Vitest configuration for client and server integration tests; see its README

## TypeScript

The workspace uses the Rust TypeScript compiler, `tsrs`. The root `prepare` script patches its installed binary with `@effect/tsgo`'s build, so workspace scripts, Vitest's `checker: "tsrs"`, and the native type-benchmark harness all use the Effect-enabled compiler. Run `pnpm prepare` if you install with lifecycle scripts disabled. Tests and isolated consumer checks can also launch it directly through `effect-tsgo tsrs`. Zed launches that proxy with `--lsp --stdio`; open the repository root and make the pinned Bun available on its PATH. Bun avoids the proxy's Node `execve` path leaving LSP stdin nonblocking. Compiler Effect diagnostics stay disabled to avoid duplicates; Oxlint owns them through the `effecttsgo` plugin in `.oxlintrc.json`.

Lint runs through `effect-tsgo --tsrs-lint vp lint` (or `vp check`) so type-aware rules also use Rust. `pnpm oxlint` wraps the standalone linter with the same integration; bare `pnpm exec oxlint` and `pnpm exec vp lint` bypass it. The Zed Oxlint server uses the same wrapper. Keep `@effect/tsgo`, `tsrs`, and Oxlint on versions listed together in Effect's supported-component table. These integrations support Linux glibc x64/ARM64, macOS x64/ARM64, and Windows x64, not Linux musl or Windows ARM64.

Every Effect lint rule except `missing-pipeable-signature` and `unstable-api-usage` is explicitly enabled
as an error, including rules disabled by upstream presets. Do not change API
shapes to satisfy the disabled pipeability rule. `scripts/effectLint.test.ts` checks coverage
against the installed plugin's schema so upgrades cannot silently omit new
rules. Fix findings rather than disabling additional rules. Unstable API usage
is permitted globally: the platform, HTTP, AI, and test integrations deliberately
depend on these APIs, so do not maintain per-export `allowedUnstableApis` grants.
Keep public API stability annotations accurate; disabling the diagnostic does
not make an unstable API stable.
Keep compatibility exceptions local and documented: existing structural service
identifiers retain their public requirement types, and Convex handler entry
points provide invocation-local layers before the terminal runner executes them.
The CLI evaluator retains native fork IPC for process isolation and compatibility
with user modules; its adapter and lifecycle tests have line-scoped exceptions.

## Build System

Packages are built with tsdown (JavaScript output) plus TypeScript project references: each package has a composite `tsconfig.src.json`, and `tsrs -b` typechecks the graph in dependency order and emits the `.d.ts` declarations (tsdown is configured with `dts: false`). The exception is `@confect/cli`, which ships only a binary: it has no `tsconfig.src.json` and emits no declarations; its build is tsdown-only and its sources are typechecked by the root `tsconfig.json`.

**Critical: packages must be rebuilt with `pnpm build` after source changes for those changes to be reflected outside their package directory.** Consumers import from `dist/`, not `src/`. During development, use `pnpm dev` to watch-rebuild all packages automatically: it runs tsdown in watch mode in every package (JavaScript output) alongside a single root `tsrs -b --watch` over the project-reference graph (declaration output, in dependency order).

Build, lint, and format run through Vite+ (`vp`), which orders packages by their dependency graph and caches results. There are no per-package script variants at the root; target a single package ad hoc with `vp run --filter <pkg> <task>` (e.g. `vp run --filter @confect/core build`). Tests run through Vitest directly (not `vp`); target one package's suite with `vitest run --project @confect/core`.

### Key Commands (run from repo root)

- `pnpm build` - Build all @confect packages (cached, dependency-ordered)
- `pnpm dev` - Watch-rebuild all packages (tsdown watchers + `tsrs -b --watch` for declarations)
- `pnpm dev:example`/`pnpm dev:docs` - Run the example app/docs site
- `pnpm test` - Run all package test suites via Vitest (`vitest run`)
- `pnpm typecheck` - Typecheck the package graph and test suites via `tsrs -b` (project references, incremental)
- `pnpm typecheck:inexact` - Refresh normal package declarations, then typecheck every package's sources and tests with `exactOptionalPropertyTypes: false`
- `pnpm --filter example typecheck:inexact` - Typecheck both example projects with `exactOptionalPropertyTypes: false` (run `pnpm build` first)
- `pnpm lint`/`pnpm lint:fix` - Lint (Oxlint + Syncpack); `lint:fix` writes fixes
- `pnpm format`/`pnpm format:check` - Format (Oxfmt + Syncpack); `format` writes, `format:check` only checks
- `pnpm check` - Format, lint, and type checks together (`effect-tsgo --tsrs-lint vp check`)
- `pnpm clean` - Remove dist, coverage, and node_modules everywhere

## Testing

Tests use Vitest with a root-level `vitest.config.ts` (which discovers `packages/*/vitest.config.ts` plus the oxlint-rules test config) and shared config in `vitest.shared.ts`. Coverage settings are shared with the root through `vitest.coverage.ts`; root runs keep coverage opt-in (`--coverage`), while package runs and CI test lanes collect it. Discover only explicit Vitest configs so packages without tests do not load their Vite+ build plugins into the test runner. The core, foldkit, js, react, server, and cli packages all have tests. The @confect/server package has integration tests using convex-test.

Tests import the public package specifiers (e.g. `@confect/core/Ref`); `vitest.shared.ts` aliases those to each package's `src/` so suites run against source rather than built `dist/`.

### Test organization

- **Keep unit tests per-module.** Use `packages/<package>/test/<Module>.test.ts` for a source module's public contract. When a feature spans several modules, extend their existing suites rather than introducing a feature-named root suite.
- **Organize assertions by ownership.** A unit test may construct inputs with other modules; place it in the suite for the module whose contract it verifies.
- **Keep integration coverage separate.** Tests whose purpose is to verify how modules work together or interact across runtime boundaries belong in integration suites. Extend the relevant existing suite and reuse its harness and fixtures rather than adding a parallel setup in the unit-test directory.
- **Make new integration conventions explicit.** If integration coverage needs a new layout, document its location and configure test discovery explicitly.

### Running tests

Run `pnpm test` to run all suites at once, or target a single package with `vitest run --project @confect/<pkg>` (e.g. `vitest run --project @confect/core`). Run tests with `vitest run`, not `vp test`—the Vite+ test runner mishandles type-only test files. Convex integration suites have dedicated scripts: `pnpm test:server:mock-backend`, `pnpm test:server:local-backend`, and `pnpm test:js:local-backend`. The two local-backend suites share `tools/local-backend` and must run sequentially because they use the same ports. Regenerate their shared fixture project with `pnpm codegen:local-backend`.

## Versioning and Publishing

All @confect packages are in a fixed version group via Changesets, meaning they are always versioned and released together. Use `pnpm changeset` to create a changeset before merging a PR with user-facing changes.

## Capy development environment

### Running the example app

The example app is in `apps/example`. To start it:

```bash
cd apps/example
pnpm dev
```

This runs Vite, the Convex local backend, the Confect codegen watcher, and a
`tsrs` typecheck watcher concurrently. Convex's embedded checker only supports
`tsc` and `tsgo`, so it is disabled in the example scripts. The Rust watcher
reports frontend and backend errors without blocking Convex's hot pushes;
`pnpm --filter example typecheck` and CI remain the blocking checks. The
`convex-codegen` script runs a blocking Rust check after generation.

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
