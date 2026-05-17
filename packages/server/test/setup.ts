import { Command, type CommandExecutor, Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Config, Effect, Option, pipe } from "effect";

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

/**
 * Build a Vitest `globalSetup` that runs `pnpm confect codegen` against the
 * given fixture directory before the suite starts.
 *
 * `pnpm confect codegen` walks up from `process.cwd()` to find the nearest
 * `convex.json` (see `@confect/cli`'s `ConvexDirectory`), so each fixture
 * project needs to be the cwd while its codegen runs. We chdir for the
 * duration of the codegen call and restore the original cwd via `ensuring`.
 *
 * Codegen is skipped on CI: the `@confect/server` GitHub workflow runs the
 * Confect CLI as a separate step before invoking vitest, so this hook is
 * just a developer convenience for local runs.
 */
export const setupForFixture =
  (baseDir: string, fixtureSubpath: string) => () =>
    pipe(
      Config.option(Config.boolean("CI")),
      Effect.map(Option.getOrElse(() => false)),
      Effect.if({
        onTrue: () => Effect.void,
        onFalse: () =>
          Effect.gen(function* () {
            const path = yield* Path.Path;
            const fixtureDir = path.resolve(baseDir, fixtureSubpath);
            const originalCwd = process.cwd();

            yield* Effect.gen(function* () {
              process.chdir(fixtureDir);
              yield* runCommand("pnpm", ["confect", "codegen"]);
            }).pipe(
              Effect.ensuring(Effect.sync(() => process.chdir(originalCwd))),
            );
          }),
      }),
      Effect.provide(NodeContext.layer),
      Effect.runPromise,
    );
