import { Command } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";

export const setup = () => {};

// TODO: Run for `server` module tests.
export const setup_ = () =>
  Effect.gen(function* () {
    const confectGenerate = Command.make("pnpm", "confect", "generate").pipe(
      Command.stdout("inherit"),
      Command.stderr("inherit"),
      Command.exitCode,
    );

    const convexCodegen = Command.make("pnpm", "convex", "codegen").pipe(
      Command.stdout("inherit"),
      Command.stderr("inherit"),
      Command.exitCode,
    );

    yield* confectGenerate;
    yield* convexCodegen;
  }).pipe(Effect.provide(NodeContext.layer), Effect.runPromise);

export const teardown = () => {};
