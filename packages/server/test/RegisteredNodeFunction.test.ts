import { FunctionSpec } from "@confect/core";
import { describe, it } from "@effect/vitest";
import { assertTrue } from "@effect/vitest/utils";
import { Effect, Schema } from "effect";
import * as DatabaseSchema from "../src/DatabaseSchema";
import * as RegisteredNodeFunction from "../src/RegisteredNodeFunction";
import * as RegistryItem from "../src/RegistryItem";

const testSchema = DatabaseSchema.make();
const testApi = {
  databaseSchema: testSchema,
  spec: {} as any,
  runtime: "Node" as const,
} as any;

describe("RegisteredNodeFunction", () => {
  it.effect(
    "make with Confect provenance returns a registered action (public)",
    () =>
      Effect.sync(() => {
        const functionSpec = FunctionSpec.publicAction({
          name: "testAction",
          args: Schema.Struct({}),
          returns: Schema.Null,
        });

        const registryItem = RegistryItem.make({
          functionSpec,
          handler: (() => Effect.succeed(null)) as any,
        });

        const result = RegisteredNodeFunction.make(testApi, registryItem);
        assertTrue(result !== undefined);
      }),
  );

  it.effect(
    "make with Confect provenance returns a registered action (internal)",
    () =>
      Effect.sync(() => {
        const functionSpec = FunctionSpec.internalAction({
          name: "testInternalAction",
          args: Schema.Struct({}),
          returns: Schema.Null,
        });

        const registryItem = RegistryItem.make({
          functionSpec,
          handler: (() => Effect.succeed(null)) as any,
        });

        const result = RegisteredNodeFunction.make(testApi, registryItem);
        assertTrue(result !== undefined);
      }),
  );

  it.effect("make with Convex provenance returns the raw handler", () =>
    Effect.sync(() => {
      const rawHandler = { isRegistered: true } as any;

      const convexFunctionSpec = {
        name: "rawAction",
        runtimeAndFunctionType: {
          runtime: "Node",
          functionType: "action",
        },
        functionVisibility: "public",
        functionProvenance: { _tag: "Convex" as const },
      } as any;

      const registryItem = RegistryItem.make({
        functionSpec: convexFunctionSpec,
        handler: rawHandler,
      });

      const result = RegisteredNodeFunction.make(testApi, registryItem);
      assertTrue(result === rawHandler);
    }),
  );
});
