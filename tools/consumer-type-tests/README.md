# Consumer type tests

These compile-only integration tests check how the published `@confect/*`
declarations compose in a consumer project. They run with `strict: true` and
with `exactOptionalPropertyTypes` both enabled and disabled.

Unlike the package unit suites, this workspace has no source aliases. Imports
resolve through each package's `exports` to `dist/*.d.ts`. Keep it out of the
root source/test TypeScript project, whose path mappings bypass those exports.

## Run

```sh
pnpm build
pnpm check:consumer-types
```

`pnpm typecheck` also runs these checks after regenerating package declarations,
so the existing CI typecheck job covers both consumer configurations.

Both configurations compile every file under `test/`. The files use
`expectTypeOf` assertions but are never executed by Vitest: ambient service
declarations stand in for running clients and backends. Put shared specs in
`test/fixtures.ts`, spec/ref extraction assertions in `test/FunctionSpec.ts`,
and cross-package error-channel assertions in `test/ErrorChannels.ts`.

Keep strict-only negative assertions in the existing package suites. Disabling
`exactOptionalPropertyTypes` intentionally lets TypeScript accept explicit
`undefined` for optional properties, including database patch fields and
Foldkit interrupt options. These consumer tests check that error inference
stays precise under either configuration; they do not promise identical
optional-property assignability.
