import { Command } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";

export const setup = () =>
  Command.make("pnpm", "convex", "codegen").pipe(
    Command.stdout("inherit"),
    Command.stderr("inherit"),
    Command.exitCode,
    Effect.provide(NodeContext.layer),
    Effect.runPromise,
  );

export const teardown = () => {};
