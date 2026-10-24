# CLI process integration tests

The dev tests launch `bin/confect.mjs` in disposable consumer directories with no generated files. They use the built CLI and workspace package distributions, not Vitest's source aliases. Run `pnpm build` before `pnpm exec vitest run --project @confect/cli test/integration` (CI's shared setup also builds first).

The dev scenarios are split into independent suites so Vitest can schedule them across the CLI's workers:

- `devConfiguration.test.ts` covers configuration selection, session restarts, and startup bootstrapping.
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

`scripts/cliTestSequencer.ts` balances files by estimated execution duration and starts the longest files first. The initial weights come from the Windows job in [main run 40092653737](https://github.com/rjdellecese/confect/actions/runs/40092653737); each split integration suite's weight is the sum of its original cases. Runtime and typecheck specifications for the same file stay together. New files are discovered normally and receive a one-second estimate, so the weights are scheduling hints, not an allowlist.

Keep the weights identical across all shards: do not derive assignments from machine-local Vitest caches or runner timings. Otherwise different runners could disagree about which shard owns a file. Update the checked-in estimates from the `cli-results-<os>-<shard>` timing artifacts when the workload changes materially. The sequencer's script tests check complete assignment, runtime/typecheck pairing, platform-independent ordering, and input preservation.

Each shard retains coverage collection and writes a Vitest blob report plus JSON timings. A report job per operating system merges all four blobs without rerunning tests and uploads the `cli-coverage-<os>` artifact. The report jobs install dependencies but do not rebuild packages. Linux and Windows reports stay separate because their source paths differ.

The other package unit suites run together per operating system, including React. Their root Vitest config inherits the shared coverage settings. Dedicated mock-backend and local-backend jobs remain separate. Build verification uses one complete package build per operating system instead of rebuilding every package in each package-specific job.

## Compiler and supervisor coverage

Both commands obtain their compiler policy from `CompilationSession`. One-shot generation uses the same resolver and artifact pipeline as dev without starting native or filesystem watchers. `../CompilationSession.test.ts` checks both lifecycle modes and verifies that package and project configuration changes remain guarded without watcher delivery.

Configuration selection belongs to `CompilationConfig`, not the command session. Its resolved options and input observations travel together; native contexts receive flattened `tsconfigRaw`, never a config filename to resolve independently. The command tests assert the actual options and retain the three-context budget for a shared helper compiled under two entry profiles. The process tests cover inherited aliases, a same-size base-config edit that changes generated exports after exactly one restart, incremental helper edits, and fresh-codegen equality. Shadowed parent configs, imported helpers' nested configs, and unused `jsconfig.json` files must not force a restart or become parsing failures.

`DevSupervisor.test.ts` exercises real supervisor and session processes through temporary `.mjs` launchers. These launchers import `DevSupervisor.ts` directly using Node's native TypeScript support, so this suite does not require a CLI build. Typed stdout events gate lifecycle assertions; a temporary journal records session start and cleanup PIDs. The tests verify a single restart, inherited stdout/stderr, successful exit, and cleanup without orphan processes when the supervisor's control IPC disconnects. They use event deadlines rather than sleeps and remove their launchers and journals through scoped cleanup.

The supervisor acknowledges a restart by disconnecting IPC after recording the request; the child waits for that acknowledgement before exiting. Process `exit` is the no-overlap barrier. On Node 24.21.0, parent-initiated IPC disconnection can emit `disconnect` and `exit` without a subsequent `close`, so the harness waits separately for process exit and output-stream completion.

## Performance regressions for issue #771

The impl-only edit cases count module evaluations instead of asserting a machine-dependent duration. They require the edited impl to be evaluated, but no unrelated impls. The fixture first recovers from an invalid table so it also exercises the transition from a failed initial sync to incremental validation.

The readiness cases also cover edits received during validation. The coordinator acknowledges only the compiler revisions consumed by a job and verifies the active contexts before reporting success. A subsequent edit must remain pending rather than being acknowledged as part of an older job. The source-level dev tests also count explicit rebuilds: prepared declaration and implementation revisions avoid a redundant consumption build while retaining final verification.

The source-level startup tests edit a dependency at the first native build's `onStart` boundary and check the generated exports at the first readiness message, covering dependencies both inside and outside `confect/`. Watcher error tests wait for explicit diagnostics before repairing the input, including errors without a source location, so diagnostic coverage does not depend on file-write timing. Process tests also remove auth, HTTP, and cron sources while an impl is invalid, then verify that recovery removes their generated outputs without deleting manually managed optional files.

Companion tests in `../dev.test.ts` count real esbuild contexts after all fixture modules appear in the watched graphs. Both one-group and eight-group fixtures have a budget of four contexts, allowing a small fixed set of shared graphs rather than one graph per entry point. `../codegen.test.ts` checks that a codegen pass does not request a second standalone bundle of an already validated spec.

Run these regression tests after `pnpm build`:

```sh
pnpm exec vitest run --project @confect/cli test/codegen.test.ts test/dev.test.ts test/integration/dev --testNamePattern 'does not bundle the same spec|does not reevaluate|uses a bounded number|reconciles a startup edit|retries removal|preserves optional outputs'
```
