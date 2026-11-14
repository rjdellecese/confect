import * as NodeServices from "@effect/platform-node/NodeServices";
import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";

const runCommand = (
  command: string,
  args: ReadonlyArray<string>,
): Effect.Effect<void, never, ChildProcessSpawner> =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const exitCode = yield* spawner.exitCode(
      ChildProcess.make(command, args, {
        stdout: "inherit",
        stderr: "inherit",
      }),
    );
    if (exitCode !== 0) {
      return yield* Effect.die(
        new Error(`${command} failed (exit code ${exitCode})`),
      );
    }
  }).pipe(Effect.orDie);

// Resolve the CLI by repository location so the harness does not depend on
// @confect/cli, which would create a workspace cycle through @confect/server.
// The CLI shim checks that its build output exists before running codegen.
const confectCliEntryUrl = new URL(
  "../../../packages/cli/bin/confect.mjs",
  import.meta.url,
);

/**
 * Build a Vitest `globalSetup` that runs `confect codegen` against the given
 * fixture directory before the suite starts.
 *
 * The CLI walks up from `process.cwd()` to find the nearest `package.json` (see
 * `@confect/cli`'s `ProjectRoot`), which it then treats as the project root
 * when locating the Convex directory. Each fixture project therefore needs to
 * be the cwd while its codegen runs. We chdir for the duration of the codegen
 * call and restore the original cwd via `ensuring`.
 *
 * Codegen runs both locally and on CI. The fixtures' generated outputs
 * (`confect/_generated/` and the wrapper files under `convex/`) are committed
 * to the repo, and CI verifies (via the `verify-codegen-committed` action) that
 * codegen produces no changes—i.e. that the committed outputs are up-to-date.
 */
export const setupForFixture =
  (
    baseDir: string,
    fixtureSubpath: string,
    componentDirs: ReadonlyArray<string> = [],
  ) =>
  () =>
    pipe(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fixtureDir = path.resolve(baseDir, fixtureSubpath);
        const originalCwd = process.cwd();
        const cliEntry = yield* path.fromFileUrl(confectCliEntryUrl);

        yield* Effect.gen(function* () {
          process.chdir(fixtureDir);
          for (const componentDir of componentDirs) {
            yield* runCommand(process.execPath, [
              cliEntry,
              "codegen",
              "--component-dir",
              componentDir,
            ]);
          }
          yield* runCommand(process.execPath, [cliEntry, "codegen"]);
        }).pipe(Effect.ensuring(Effect.sync(() => process.chdir(originalCwd))));
      }),
      Effect.provide(NodeServices.layer),
      Effect.runPromise,
    );
