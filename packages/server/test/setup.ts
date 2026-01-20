import { Command, type CommandExecutor, Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";

const runCommand = (
  command: string,
  args: string[],
): Effect.Effect<void, never, CommandExecutor.CommandExecutor> =>
  Command.make(command, ...args).pipe(
    Command.stderr("inherit"),
    Command.stdout("inherit"),
    Command.exitCode,
    Effect.andThen((exitCode) =>
      exitCode !== 0
        ? Effect.dieMessage(`${command} failed (exit code ${exitCode})`)
        : Effect.void,
    ),
    Effect.orDie,
  );

export const setup = () =>
  Effect.gen(function* () {
    const originalCwd = process.cwd();
    const path = yield* Path.Path;
    const testDir = import.meta.dirname;
    const rootDir = path.join(testDir, "..", "..", "..");

    yield* Effect.gen(function* () {
      process.chdir(rootDir);

      yield* runCommand("pnpm", ["build"]);
    }).pipe(Effect.ensuring(Effect.sync(() => process.chdir(originalCwd))));

    yield* Effect.gen(function* () {
      process.chdir(testDir);

      yield* runCommand("pnpm", ["confect", "codegen"]);
      yield* runCommand("pnpm", ["convex", "dev", "--local", "--once"]);
    }).pipe(Effect.ensuring(Effect.sync(() => process.chdir(originalCwd))));
  }).pipe(Effect.provide(NodeContext.layer), Effect.runPromise);
