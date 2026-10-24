# CLI process integration tests

The dev tests launch `bin/confect.mjs` in disposable consumer directories with no generated files. They use the built CLI and workspace package distributions, not Vitest's source aliases. Run `pnpm build` before `pnpm exec vitest run --project @confect/cli test/integration` (CI's shared setup also builds first).

Each consumer has its own package, TypeScript configuration, and writable `node_modules` directory. The fixture copies the built `@confect/core` and `@confect/server` manifests and distributions into that directory, linking each copy's dependency directory to its workspace installation. Their physical paths remain inside `node_modules`, so the compiler treats them as installed dependencies instead of rebundling the workspace libraries for every scenario. No package installation or network access is needed per test.

`../codegen.test.ts` separately verifies fresh-output parity with workspace-linked dependencies, including the distinction between external installed libraries and bundled workspace libraries. Packed-consumer checks remain responsible for validating complete npm/pnpm installations. Tests clean up consumers and child processes through Effect scopes. Output gates coordinate edits and assertions. The bounded quiet-window check intentionally uses real time to detect watcher self-trigger loops.

CLI test-file concurrency is capped at two workers, or one on a single-CPU machine. Compiler suites also launch native builders and evaluation processes; an unrestricted worker pool can create contention and timeout failures. Keep runtime tests, typechecking, and coverage enabled when qualifying changes to this limit.

Both commands obtain their compiler policy from `CompilationSession`. One-shot generation uses the same resolver and artifact pipeline as dev without starting native or filesystem watchers. `../CompilationSession.test.ts` checks both lifecycle modes and verifies that package and project configuration changes remain guarded without watcher delivery.

Configuration selection belongs to `CompilationConfig`, not the command session. Its resolved options and input observations travel together; native contexts receive flattened `tsconfigRaw`, never a config filename to resolve independently. The command tests assert the actual options and retain the three-context budget for a shared helper compiled under two entry profiles. The process tests cover inherited aliases, a same-size base-config edit that changes generated exports after exactly one restart, incremental helper edits, and fresh-codegen equality. Shadowed parent configs, imported helpers' nested configs, and unused `jsconfig.json` files must not force a restart or become parsing failures.

`DevSupervisor.test.ts` exercises real supervisor and session processes through temporary `.mjs` launchers. These launchers import `DevSupervisor.ts` directly using Node's native TypeScript support, so this suite does not require a CLI build. Typed stdout events gate lifecycle assertions; a temporary journal records session start and cleanup PIDs. The tests verify a single restart, inherited stdout/stderr, successful exit, and cleanup without orphan processes when the supervisor's control IPC disconnects. They use event deadlines rather than sleeps and remove their launchers and journals through scoped cleanup.

The supervisor acknowledges a restart by disconnecting IPC after recording the request; the child waits for that acknowledgement before exiting. Process `exit` is the no-overlap barrier. On Node 24.21.0, parent-initiated IPC disconnection can emit `disconnect` and `exit` without a subsequent `close`, so the harness waits separately for process exit and output-stream completion.

## Performance regressions for issue #771

The impl-only edit cases count module evaluations instead of asserting a machine-dependent duration. They require the edited impl to be evaluated, but no unrelated impls. The fixture first recovers from an invalid table so it also exercises the transition from a failed initial sync to incremental validation.

The readiness cases also cover edits received during validation. The coordinator acknowledges only the compiler revisions consumed by a job and verifies the active contexts before reporting success. A subsequent edit must remain pending rather than being acknowledged as part of an older job. The source-level dev tests also count explicit rebuilds: prepared declaration and implementation revisions avoid a redundant consumption build while retaining final verification.

The source-level startup tests edit a dependency at the first native build's `onStart` boundary and check the generated exports at the first readiness message, covering dependencies both inside and outside `confect/`. Process tests also remove auth, HTTP, and cron sources while an impl is invalid, then verify that recovery removes their generated outputs without deleting manually managed optional files.

Companion tests in `../dev.test.ts` count real esbuild contexts after all fixture modules appear in the watched graphs. Both one-group and eight-group fixtures have a budget of four contexts, allowing a small fixed set of shared graphs rather than one graph per entry point. `../codegen.test.ts` checks that a codegen pass does not request a second standalone bundle of an already validated spec.

Run these regression tests after `pnpm build`:

```sh
pnpm exec vitest run --project @confect/cli test/codegen.test.ts test/dev.test.ts test/integration/dev.test.ts --testNamePattern 'does not bundle the same spec|does not reevaluate|uses a bounded number|reconciles a startup edit|retries removal|preserves optional outputs'
```
