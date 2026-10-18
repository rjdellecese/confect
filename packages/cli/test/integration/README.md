# CLI process integration tests

The dev tests launch `bin/confect.mjs` in disposable consumer directories with no generated files. They use the built CLI and workspace package distributions, not Vitest's source aliases. Run `pnpm build` before `pnpm exec vitest run --project @confect/cli test/integration` (CI's shared setup also builds first).

Each consumer has its own package and TypeScript configuration; dependencies resolve through the CLI package's installed dependencies. Tests clean up consumers and child processes through Effect scopes. Output gates coordinate edits and assertions. The bounded quiet-window check intentionally uses real time to detect watcher self-trigger loops.

`DevSupervisor.test.ts` exercises real supervisor and session processes through temporary `.mjs` launchers. These launchers import `DevSupervisor.ts` directly using Node's native TypeScript support, so this suite does not require a CLI build. Typed stdout events gate lifecycle assertions; a temporary journal records session start and cleanup PIDs. The tests verify a single restart, inherited stdout/stderr, successful exit, and cleanup without orphan processes when the supervisor's control IPC disconnects. They use event deadlines rather than sleeps and remove their launchers and journals through scoped cleanup.

The supervisor acknowledges a restart by disconnecting IPC after recording the request; the child waits for that acknowledgement before exiting. Process `exit` is the no-overlap barrier. On Node 24.21.0, parent-initiated IPC disconnection can emit `disconnect` and `exit` without a subsequent `close`, so the harness waits separately for process exit and output-stream completion.

## Performance regressions for issue #771

The impl-only edit cases count module evaluations instead of asserting a machine-dependent duration. They require the edited impl to be evaluated, but no unrelated impls. The fixture first recovers from an invalid table so it also exercises the transition from a failed initial sync to incremental validation.

The readiness cases also cover edits received during validation. After full codegen writes generated files, the watcher joins any in-flight build and then performs a fresh rebuild before reporting success. This prevents a subsequent edit from being absorbed into an older dependency snapshot; queued user changes must remain pending rather than being discarded as generated-file echoes.

Startup takes the first watcher snapshot before initial codegen. The source-level startup tests edit a dependency at the first build's `onStart` boundary and check the generated exports at the first readiness message, covering dependencies both inside and outside `confect/`. Process tests also remove auth, HTTP, and cron sources while an impl is invalid, then verify that recovery removes their generated outputs without deleting manually managed optional files.

Companion tests in `../dev.test.ts` count real esbuild contexts after all fixture modules appear in the watched graphs. Both one-group and eight-group fixtures have a budget of four contexts, allowing a small fixed set of shared graphs rather than one graph per entry point. `../codegen.test.ts` checks that a codegen pass does not request a second standalone bundle of an already validated spec.

Run these regression tests after `pnpm build`:

```sh
pnpm exec vitest run --project @confect/cli test/codegen.test.ts test/dev.test.ts test/integration/dev.test.ts --testNamePattern 'does not bundle the same spec|does not reevaluate|uses a bounded number|reconciles a startup edit|retries removal|preserves optional outputs'
```
