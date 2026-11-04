# confect-bench-harness

Re-exports [`@ark/attest`](https://github.com/arktypeio/arktype/tree/main/ark/attest)'s
`bench` to `packages/*/test/*.bench.ts`. The package pins the native compiler API
used to inspect benchmark syntax and count type instantiations.

See [the toolchain benchmark](TOOLCHAIN.md) for migration timings, memory
measurements, raw samples, and reproduction commands.

Run the suites after `pnpm install` and `pnpm build`:

```sh
pnpm --filter @confect/core bench
pnpm --filter @confect/server bench
```

Every benchmark command explicitly selects `--checker tsrs`, so a missing Rust
binary fails instead of silently switching to Go. The root `prepare` script
patches the installed `tsrs` binary with `@effect/tsgo`'s build; this covers both
attest's API process and its compiler subprocesses. Effect diagnostics remain
disabled in `tsconfig.base.json`.

`typescript@7.1.0-beta` is still required by attest's imports and its native/JS
API selection. It is not the checker used by these suites. Do not remove it or
replace it with TypeScript 6, which selects attest's old in-process counting
algorithm.

## Compatibility patch

`patches/@ark__attest@0.58.0.patch` changes attest's stale
`tsrs/unstable/{ast,sync,fs}` imports to `tsrs/{ast,sync,fs}`, the exports provided
by the pinned tsrs release. The patch is registered in `pnpm-workspace.yaml` and
applied on install. Remove it when an attest release supports these exports,
then run both benchmark suites before accepting the upgrade.

## Interpreting the native baselines

The baselines were re-recorded when moving from TypeScript 6 to tsrs. Native
attest measures a baseline program and each isolated benchmark variant with
`--extendedDiagnostics --singleThreaded`, then subtracts their instantiation
counts. Work shared with dependencies moves into the baseline, so these counts
are not comparable to the old JS checker's counts. A lower count at this
migration is not evidence of a Confect optimization or a wall-clock speedup.

When intentionally changing the compiler or counting algorithm, re-record with
`ATTEST_CONFIG='{"updateSnapshots":true,"shouldFormat":false}'` before each
command above. Keep only the `.types` baseline changes: the server suite also
contains runtime `.median` measurements, whose baselines must stay unchanged
for a compiler migration. Run Oxfmt and Oxlint on the changed benchmark files,
review the baseline-only diff, and rerun both suites without snapshot updates.
