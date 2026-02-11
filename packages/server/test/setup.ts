import { Command, type CommandExecutor } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Config, Effect } from "effect";

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

export const setup = () =>
  Effect.if(Config.boolean("CI"), {
    onTrue: () => Effect.void,
    onFalse: () =>
      Effect.gen(function* () {
        const originalCwd = process.cwd();
        const testDir = import.meta.dirname;

        yield* Effect.gen(function* () {
          process.chdir(testDir);

          yield* runCommand("pnpm", ["confect", "codegen"]);
          yield* runCommand("pnpm", ["convex", "dev", "--local", "--once"]);
        }).pipe(Effect.ensuring(Effect.sync(() => process.chdir(originalCwd))));
      }),
  }).pipe(Effect.provide(NodeContext.layer), Effect.runPromise);
