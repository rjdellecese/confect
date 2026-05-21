import { Command, type CommandExecutor, Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, pipe } from "effect";
import { fileURLToPath } from "node:url";

const runCommand = (
  command: string,
  args: string[],
): Effect.Effect<void, never, CommandExecutor.CommandExecutor> =>
  Command.make(command, ...args).pipe(
    Command.exitCode,
    Effect.andThen((exitCode) =>
      exitCode !== 0
        ? Effect.dieMessage(`${command} failed (exit code ${exitCode})`)
        : Effect.void,
    ),
    Effect.orDie,
  );

// Absolute path to the @confect/cli entry point. Resolved from this file's
// location rather than relying on a `confect` bin in `node_modules/.bin/`,
// which is brittle in CI: `pnpm install` runs before workspace packages are
// built, so the bin link for `confect` ends up dangling until something
// re-links it.
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
        const fixtureDir = path.resolve(baseDir, fixtureSubpath);
        const originalCwd = process.cwd();
        const cliEntry = fileURLToPath(confectCliEntryUrl);

        yield* Effect.gen(function* () {
          process.chdir(fixtureDir);
          yield* runCommand(process.execPath, [cliEntry, "codegen"]);
        }).pipe(Effect.ensuring(Effect.sync(() => process.chdir(originalCwd))));
      }),
      Effect.provide(NodeContext.layer),
      Effect.runPromise,
    );
