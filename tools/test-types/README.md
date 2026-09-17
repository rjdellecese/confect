# confect-test-types

Private, type-only helpers shared by Confect's test suites. Consumers declare
`confect-test-types` as a `workspace:*` devDependency and import its source
exports with `import type`. The package has no runtime build and is not
published.

`CompilerOptions.AllowsExplicitUndefined` is `false` when the consuming
TypeScript project enables `exactOptionalPropertyTypes`, and `true` when it
disables the flag. It is evaluated by the compiler, not by reading a config
file, so command-line overrides are respected.

```ts
import type * as CompilerOptions from "confect-test-types/CompilerOptions";
```

## Verification

```sh
pnpm --filter confect-test-types typecheck
pnpm --filter confect-test-types typecheck:inexact
```

These commands compile the helper and its module tests without running Vitest.
`test/CompilerOptions.test.ts` pins the result to `false` under the package's
normal config. `test/inexact/CompilerOptions.test.ts` pins it to `true` under
that directory's tsconfig, which also gives editors the correct setting. The
expectations are literals rather than another copy of the compiler probe.

The root `pnpm typecheck` and `pnpm typecheck:inexact` commands explicitly run
the corresponding package check, including in CI. The root source/test project
excludes this package's tests so it does not combine contradictory expectations
in one compiler program. Consuming suites also check the source-exported helper
under their own compiler settings.
