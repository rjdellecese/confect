import { Command } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";

export const setup = () =>
  Effect.gen(function* () {
    const originalCwd = process.cwd();

    yield* Effect.gen(function* () {
      process.chdir(import.meta.dirname);

      const confectCodegenExitCode = yield* Command.make(
        "pnpm",
        "confect",
        "codegen",
      ).pipe(Command.exitCode);

      if (confectCodegenExitCode !== 0) {
        return yield* Effect.fail(
          `pnpm confect codegen failed with exit code ${confectCodegenExitCode}`,
        );
      }

      const convexDevExitCode = yield* Command.make(
        "pnpm",
        "convex",
        "dev",
        "--local",
        "--once",
      ).pipe(Command.exitCode);

      if (convexDevExitCode !== 0) {
        return yield* Effect.fail(
          `pnpm convex dev --once failed with exit code ${convexDevExitCode}`,
        );
      }
    }).pipe(Effect.ensuring(Effect.sync(() => process.chdir(originalCwd))));
  }).pipe(Effect.provide(NodeContext.layer), Effect.runPromise);

export function teardown() {}
