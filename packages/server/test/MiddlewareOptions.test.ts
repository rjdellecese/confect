import { FunctionSpec, GroupSpec, MiddlewareSpec, Ref } from "@confect/core";
import {
  FunctionImpl,
  GroupImpl,
  MiddlewareImpl,
  RegisteredConvexFunction,
  RegisteredFunctions,
} from "@confect/server";
import { expect, expectTypeOf, it } from "@effect/vitest";
import { convexTest } from "convex-test";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import databaseSchema from "./mock-backend/fixtures/confect/_generated/schema";

class GroupPolicy extends MiddlewareSpec.MiddlewareSpec<GroupPolicy>()(
  "GroupPolicy",
  {
    options: () => Schema.Struct({ label: Schema.String }),
    functionTypes: { query: true, mutation: true, action: true },
  },
) {}

class FunctionPolicy extends MiddlewareSpec.MiddlewareSpec<FunctionPolicy>()(
  "FunctionPolicy",
  {
    options: () => Schema.Struct({ tolerateMissing: Schema.Boolean }),
    functionTypes: { query: true, mutation: true, action: true },
  },
) {}

class Observe extends MiddlewareSpec.MiddlewareSpec<Observe>()("Observe", {
  functionTypes: { query: true, mutation: true, action: true },
}) {}

it.effect(
  "passes typed options through both implementation strategies in attachment order",
  () =>
    Effect.gen(function* () {
      const events: Array<string> = [];
      const query = FunctionSpec.publicQuery({
        name: "get",
        args: () => ({ id: Schema.String }),
        returns: () => Schema.String,
      })
        .middleware(FunctionPolicy, { tolerateMissing: true })
        .middleware(GroupPolicy, { label: "inner" })
        .middleware(Observe);
      const group = GroupSpec.make()
        .middleware(GroupPolicy, { label: "group" })
        .addFunction(query);

      const groupLayer = GroupImpl.make(databaseSchema, group).pipe(
        Layer.provide(
          FunctionImpl.make(databaseSchema, group, "get", () =>
            Effect.sync(() => {
              events.push("handler");
              return "ok";
            }),
          ),
        ),
        Layer.provide(
          MiddlewareImpl.make(
            databaseSchema,
            GroupPolicy,
            (effect, metadata) => {
              expectTypeOf(metadata.options).toEqualTypeOf<{
                readonly label: string;
              }>();
              return Effect.gen(function* () {
                expect(metadata).toEqual({
                  name: "get",
                  functionType: "query",
                  functionVisibility: "public",
                  args: { id: "decoded" },
                  options: { label: metadata.options.label },
                });
                events.push(metadata.options.label);
                const result = yield* effect;
                events.push(`${metadata.options.label}:after`);
                return result;
              });
            },
          ),
        ),
        Layer.provide(
          MiddlewareImpl.makeByFunctionType(databaseSchema, FunctionPolicy, {
            query: (effect, { options }) => {
              expectTypeOf(options).toEqualTypeOf<{
                readonly tolerateMissing: boolean;
              }>();
              return Effect.gen(function* () {
                expect(options.tolerateMissing).toBe(true);
                events.push("function");
                return yield* effect;
              });
            },
            mutation: (effect, { options }) => {
              expectTypeOf(options).toEqualTypeOf<{
                readonly tolerateMissing: boolean;
              }>();
              return effect;
            },
            action: (effect, { options }) => {
              expectTypeOf(options).toEqualTypeOf<{
                readonly tolerateMissing: boolean;
              }>();
              return effect;
            },
          }),
        ),
        Layer.provide(
          MiddlewareImpl.make(
            databaseSchema,
            Observe,
            (effect, { options }) => {
              expectTypeOf(options).toBeUndefined();
              expect(options).toBeUndefined();
              return effect;
            },
          ),
        ),
        GroupImpl.finalize,
      );

      const registered = RegisteredFunctions.buildForGroup<typeof group>(
        databaseSchema,
        groupLayer,
        RegisteredConvexFunction.make,
      );
      const t = convexTest(undefined, {
        ...import.meta.glob("./mock-backend/fixtures/convex/_generated/*.js"),
        "./mock-backend/fixtures/convex/options.ts": () =>
          Promise.resolve(registered),
      });
      expect(
        yield* Effect.promise(() =>
          t.query(Ref.getFunctionReference(Ref.make("options", query)), {
            id: "decoded",
          }),
        ),
      ).toBe("ok");
      expect(events).toEqual([
        "group",
        "function",
        "inner",
        "handler",
        "inner:after",
        "group:after",
      ]);
    }),
);

it("rejects equivalent options during registration without requiring codegen", () => {
  const query = FunctionSpec.publicQuery({
    name: "get",
    returns: () => Schema.String,
  }).middleware(GroupPolicy, { label: "same" });
  const group = GroupSpec.make()
    .middleware(GroupPolicy, { label: "same" })
    .addFunction(query);
  const layer = GroupImpl.make(databaseSchema, group).pipe(
    Layer.provide(
      FunctionImpl.make(databaseSchema, group, "get", () =>
        Effect.succeed("ok"),
      ),
    ),
    Layer.provide(
      MiddlewareImpl.make(databaseSchema, GroupPolicy, (effect) => effect),
    ),
    GroupImpl.finalize,
  );
  expect(() =>
    RegisteredFunctions.buildForGroup<typeof group>(
      databaseSchema,
      layer,
      RegisteredConvexFunction.make,
    ),
  ).toThrowError(/GroupPolicy.*equivalent options.*function "get"/);
});

it.effect("lets the inner instance shadow the same provided service", () =>
  Effect.gen(function* () {
    class Value extends Context.Service<Value, string>()(
      "@confect/server/test/MiddlewareOptions.test/Value",
    ) {}
    class ProvideValue extends MiddlewareSpec.MiddlewareSpec<
      ProvideValue,
      { provides: Value }
    >()("ProvideValue", {
      options: () => Schema.Struct({ value: Schema.String }),
      functionTypes: { query: true, mutation: false, action: false },
    }) {}
    const query = FunctionSpec.publicQuery({
      name: "get",
      returns: () => Schema.String,
    }).middleware(ProvideValue, { value: "inner" });
    const group = GroupSpec.make()
      .middleware(ProvideValue, { value: "outer" })
      .addFunction(query);
    const groupLayer = GroupImpl.make(databaseSchema, group).pipe(
      Layer.provide(
        FunctionImpl.make(databaseSchema, group, "get", () =>
          Effect.service(Value),
        ),
      ),
      Layer.provide(
        MiddlewareImpl.make(
          databaseSchema,
          ProvideValue,
          (effect, { options }) =>
            Effect.provideService(effect, Value, options.value),
        ),
      ),
      GroupImpl.finalize,
    );
    const registered = RegisteredFunctions.buildForGroup<typeof group>(
      databaseSchema,
      groupLayer,
      RegisteredConvexFunction.make,
    );
    const t = convexTest(undefined, {
      ...import.meta.glob("./mock-backend/fixtures/convex/_generated/*.js"),
      "./mock-backend/fixtures/convex/options.ts": () =>
        Promise.resolve(registered),
    });
    expect(
      yield* Effect.promise(() =>
        t.query(Ref.getFunctionReference(Ref.make("options", query)), {}),
      ),
    ).toBe("inner");
  }),
);
