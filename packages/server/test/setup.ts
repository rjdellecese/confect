import * as NodeServices from "@effect/platform-node/NodeServices";
import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";

const runCommand = (
  command: string,
  args: string[],
): Effect.Effect<void, never, ChildProcessSpawner> =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const exitCode = yield* spawner.exitCode(ChildProcess.make(command, args));
    if (exitCode !== 0) {
      return yield* Effect.die(
        new Error(`${command} failed (exit code ${exitCode})`),
      );
    }
  }).pipe(Effect.orDie);

// Absolute path to the @confect/cli entry point. Resolved from this file's
// location rather than relying on a `confect` bin in `node_modules/.bin/`,
// which is brittle in CI: `pnpm install` runs before workspace packages are
// built, so the bin link for `confect` ends up dangling until something
// re-links it.
//
// Note: `@confect/cli` is intentionally NOT declared as a (dev)dependency of
// `@confect/server`. The CLI peer-depends on `@confect/server` (its codegen
// emits and type-checks against `@confect/server` imports), so a reciprocal
// dep here would create a cyclic workspace-dependency warning from pnpm. The
// fixture sub-packages under `test/{mock,local}-backend/fixtures` declare
// `@confect/cli` themselves for the `pnpm confect codegen` calls in this
// package's `codegen:*` scripts; this `globalSetup` resolves the binary by
// filesystem path instead, so it does not require the dep graph either.
const confectCliEntryUrl = new URL("../../cli/dist/index.mjs", import.meta.url);

/**
 * Build a Vitest `globalSetup` that runs `confect codegen` against the
 * given fixture directory before the suite starts.
 *
 * The CLI walks up from `process.cwd()` to find the nearest `package.json`
 * (see `@confect/cli`'s `ProjectRoot`), which it then treats as the project
 * root when locating the Convex directory. Each fixture project therefore
 * needs to be the cwd while its codegen runs. We chdir for the duration
 * of the codegen call and restore the original cwd via `ensuring`.
 *
 * Codegen runs both locally and on CI. The fixtures' generated outputs
 * (`confect/_generated/` and the wrapper files under `convex/`) are committed
 * to the repo, and CI verifies via `git diff --exit-code` that codegen
 * produces no changes—i.e. that the committed outputs are up-to-date.
 */
export const setupForFixture =
  (baseDir: string, fixtureSubpath: string) => () =>
    pipe(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fs = yield* FileSystem.FileSystem;
        const fixtureDir = path.resolve(baseDir, fixtureSubpath);
        const originalCwd = process.cwd();
        const cliEntry = yield* path.fromFileUrl(confectCliEntryUrl);

        // Verify the @confect/cli build output exists before invoking it,
        // so a fresh checkout that hasn't run `pnpm build` yet gets a clear
        // remediation hint instead of an opaque ENOENT from `process.chdir`
        // / `node <missing-path>`. This package's tests need `@confect/cli`'s
        // `dist/` to exist as a workspace invariant; the dep graph used to
        // (vacuously) signal that requirement, but the cycle-breaking
        // refactor above means it's now only enforced by `pnpm build`.
        if (!(yield* fs.exists(cliEntry))) {
          return yield* Effect.die(
            new Error(
              `@confect/cli's build output is missing at ${cliEntry}. ` +
                `Run \`pnpm build\` from the repo root (or \`vp run --filter @confect/cli dev\` ` +
                `for a watcher) before running this test suite.`,
            ),
          );
        }

        yield* Effect.gen(function* () {
          process.chdir(fixtureDir);
          yield* runCommand(process.execPath, [cliEntry, "codegen"]);
        }).pipe(Effect.ensuring(Effect.sync(() => process.chdir(originalCwd))));
      }),
      Effect.provide(NodeServices.layer),
      Effect.runPromise,
    );
