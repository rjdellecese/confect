# CLI process integration tests

The dev tests launch `bin/confect.mjs` in disposable consumer directories with no generated files. They use the built CLI and workspace package distributions, not Vitest's source aliases. Run `pnpm build` before `pnpm exec vitest run --project @confect/cli test/integration` (CI's shared setup also builds first).

The dev scenarios are split into independent suites so Vitest can schedule them across the CLI's workers:

- `devConfiguration.test.ts` covers startup bootstrapping.
- `devIncremental.test.ts` covers dependency discovery, targeted updates, and edits received during validation.
- `devRecovery.test.ts` covers invalid or missing inputs and watcher reconciliation during recovery.
- `devOutputs.test.ts` covers generated-output invalidation, ownership, and removal.

Each suite retains the `built confect dev` title and uses the shared `Project.ts` harness. The existing `test/integration/*.test.ts` discovery glob includes all four files. Run just these suites after `pnpm build` with `pnpm exec vitest run --project @confect/cli test/integration/dev`; the path filter selects all four filenames.

Each consumer has its own package, TypeScript configuration, and writable `node_modules` directory. The fixture copies the built `@confect/core` and `@confect/server` manifests and distributions into that directory, linking each copy's dependency directory to its workspace installation. Their physical paths remain inside `node_modules`, so the compiler treats them as installed dependencies instead of rebundling the workspace libraries for every scenario. No package installation or network access is needed per test.

`../codegen.test.ts` separately verifies fresh-output parity with workspace-linked dependencies, including the distinction between external installed libraries and bundled workspace libraries. Packed-consumer checks remain responsible for validating complete npm/pnpm installations. Tests clean up consumers and child processes through Effect scopes. Output gates coordinate edits and assertions. The bounded quiet-window check intentionally uses real time to detect watcher self-trigger loops.

CLI test-file concurrency is capped at two workers, or one on a single-CPU machine. In the root test command, the CLI runs in its own execution group after the other projects, so its worker limit does not conflict with theirs. Compiler suites also launch native builders and evaluation processes; an unrestricted worker pool can create contention and timeout failures. Keep runtime tests, typechecking, and coverage enabled when qualifying changes to this limit.

## CI scheduling and reports

CI runs the complete CLI suite in four shards on both Linux and Windows, with at most two workers per shard. Run one shard locally after `pnpm build`:

```sh
pnpm --filter @confect/cli test --shard=1/4
```

Vitest's built-in sequencer assigns discovered test files to shards. There is no custom scheduler or timing table to maintain. The split integration suites let Vitest distribute the formerly serial dev-process tests across runners.

Each shard retains coverage collection and writes a Vitest blob report plus JSON timings. One Linux report job merges each operating system's four blobs without rerunning tests and uploads the `cli-coverage` artifact, with separate `linux` and `windows` directories. The report job installs dependencies but does not rebuild packages. Windows coverage uses the JSON reporter, which preserves the original Windows file paths and counters without trying to read Windows source paths on Linux; Linux coverage also includes the standard HTML report. Keeping the coverage maps separate preserves platform-specific branches while avoiding a second Windows runner setup just to merge reports.

The other package unit suites run together per operating system, including React. Their CI command enables the root config's shared coverage settings explicitly. Local `pnpm test` keeps its existing coverage-off default to avoid accumulating coverage for the entire repository in one process; package test commands still collect coverage, and root runs can opt in with `pnpm exec vitest run --coverage`. Dedicated mock-backend and local-backend jobs remain separate. Build verification uses one complete package build per operating system instead of rebuilding every package in each package-specific job.

## Compilation and evaluation ownership

One-shot codegen builds and evaluates modules in its command process. Development mode uses a separate dependency watcher and a disposable full-job evaluation worker. The watcher and evaluator compile independently; there is no shared compiler-session or artifact-revision protocol.

Configuration-restart and entry-profile tests specific to the removed compiler are excluded from this baseline. Package self-reference and configuration-resolution fixes from 10.3.2 require separate decisions before reimplementation.

## Performance regressions for issue #771

The impl-only edit cases count module evaluations instead of asserting a machine-dependent duration. They require the edited impl to be evaluated, but no unrelated impls. The fixture first recovers from an invalid table so it also exercises the transition from a failed initial sync to incremental validation.

The readiness cases also cover edits received during validation. After full codegen writes generated files, the watcher joins any in-flight build and then performs a fresh rebuild before reporting success. This prevents a subsequent edit from being absorbed into an older dependency snapshot; queued user changes must remain pending rather than being discarded as generated-file echoes.

Startup takes the first watcher snapshot before initial codegen. The source-level startup tests edit a dependency at the first build's `onStart` boundary and check the generated exports at the first readiness message, covering dependencies both inside and outside `confect/`. Process tests also remove auth, HTTP, and cron sources while an impl is invalid, then verify that recovery removes their generated outputs without deleting manually managed optional files.

Companion tests in `../dev.test.ts` count real esbuild contexts after all fixture modules appear in the watched graphs. Both one-group and eight-group fixtures have a budget of four contexts, allowing a small fixed set of shared graphs rather than one graph per entry point. `../codegen.test.ts` checks that a codegen pass does not request a second standalone bundle of an already validated spec.

Run these regression tests after `pnpm build`:

```sh
pnpm exec vitest run --project @confect/cli test/codegen.test.ts test/dev.test.ts test/integration/dev --testNamePattern 'does not bundle the same spec|does not reevaluate|uses a bounded number|reconciles a startup edit|retries removal|preserves optional outputs'
```
