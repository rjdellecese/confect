import { Command } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { cliApp } from "../src/cli/cliApp";

export async function setup() {
  await Effect.gen(function* () {
    yield* cliApp(["node", "confect", "codegen"]);

    const exitCode = yield* Command.make(
      "pnpm",
      "convex",
      "dev",
      "--once",
    ).pipe(Command.exitCode);

    if (exitCode !== 0) {
      return yield* Effect.fail(
        `pnpm convex dev --once failed with exit code ${exitCode}`,
      );
    }
  }).pipe(Effect.provide(NodeContext.layer), Effect.runPromise);
}

export function teardown() {}
