import type { Backend } from "@confect/alchemy/Confect";
import { type BackendProps } from "@confect/alchemy/Confect";
import * as Convex from "@confect/alchemy/Convex";
import { expect, expectTypeOf, it } from "@effect/vitest";
import type * as Output from "alchemy/Output";
import type * as Config from "effect/Config";
import type * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";

it("accepts the documented plan-time inputs without accepting arbitrary effects as nested props", () => {
  expectTypeOf<BackendProps["deployment"]["name"]>().toEqualTypeOf<
    string | Config.Config<string> | Output.Output<string, unknown>
  >();
  expectTypeOf<Effect.Effect<string>>().not.toExtend<
    BackendProps["deployment"]["name"]
  >();
  expectTypeOf<BackendProps["deployKey"]>().toEqualTypeOf<
    | Redacted.Redacted<string>
    | Config.Config<Redacted.Redacted<string>>
    | Output.Output<Redacted.Redacted<string>, unknown>
  >();
  expectTypeOf<Effect.Success<ReturnType<typeof Backend>>>().toEqualTypeOf<{
    code: Convex.Code;
    environment: Convex.EnvironmentVariables | undefined;
    name: Output.Output<string, never>;
    url: Output.Output<string, never>;
  }>();
  expect([
    Convex.Project.Type,
    Convex.Deployment.Type,
    Convex.DeployKey.Type,
    Convex.Code.Type,
    Convex.EnvironmentVariables.Type,
    Convex.AuthoritativeEnvironmentVariable.Type,
  ]).toEqual([
    "Convex.Project",
    "Convex.Deployment",
    "Convex.DeployKey",
    "Convex.Code",
    "Convex.EnvironmentVariables",
    "Convex.AuthoritativeEnvironmentVariable",
  ]);
});
