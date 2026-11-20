import type { Convex } from "@confect/alchemy";
import type * as Code from "@confect/alchemy/Code";
import { expectTypeOf, it } from "@effect/vitest";

it("accepts reusable preparation commands from either public entry point", () => {
  const prepare = {
    command: "node",
    args: ["scripts/generate.mjs"],
  } as const satisfies Convex.PrepareCommand;
  expectTypeOf<Convex.PrepareCommand>().toEqualTypeOf<Code.PrepareCommand>();
  expectTypeOf(prepare).toExtend<NonNullable<Code.CodeProps["prepare"]>>();
});
