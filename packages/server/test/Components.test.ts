import type { Ref } from "@confect/core";
import { Component } from "@confect/core";
import {
  Auth,
  type DataModel,
  DatabaseSchema,
  MutationAuth,
  MutationCtx,
  MutationRunner,
  QueryRunner,
  RegisteredConvexFunction,
} from "@confect/server";
// Keep the server/test workspace dependency graph acyclic, as in mock-backend/TestConfect.ts.
import { TestConfect } from "../../test/src";
import { expect, expectTypeOf, it } from "@effect/vitest";
import { convexTest } from "convex-test";
import {
  componentsGeneric,
  defineSchema,
  type FunctionReference,
} from "convex/server";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Array from "effect/Array";
import * as Result from "effect/Result";
import * as Option from "effect/Option";
import type componentDatabase from "../../cli/test/fixtures/authored-component/confect/_generated/schema";
import { target } from "../../cli/test/fixtures/authored-component/confect/_generated/id";
import tableNames from "../../cli/test/fixtures/authored-component/confect/_generated/tableNames";
import contract from "../../cli/test/fixtures/authored-component/confect/_generated/component";
import componentSchema from "../../cli/test/fixtures/authored-component/convex/schema";

// The wire API shape Convex generates: component IDs are strings, not host IDs.
type CounterApi<ComponentName extends string> = {
  counter: {
    create: FunctionReference<
      "mutation",
      "internal",
      { count: string },
      string,
      ComponentName
    >;
    list: FunctionReference<
      "query",
      "internal",
      {},
      Array<{ _id: string; _creationTime: number; count: string }>,
      ComponentName
    >;
    reject: FunctionReference<"mutation", "internal", {}, null, ComponentName>;
  };
};
const components = componentsGeneric() as unknown as {
  first: CounterApi<"first">;
  second: CounterApi<"second">;
};
const first = Component.bind(contract, components.first);
const second = Component.bind(contract, components.second);
const hostSchema = DatabaseSchema.make({});
const hostConvexSchema = defineSchema({});
const hostModules = { "_generated/server.ts": () => Promise.resolve({}) };
const componentModules = {
  "_generated/server.ts": () => Promise.resolve({}),
  "counter.ts": () =>
    import("../../cli/test/fixtures/authored-component/convex/counter"),
};

it.effect(
  "provides application authentication without a schema type or target",
  () =>
    Effect.gen(function* () {
      const layer = TestConfect.layer([], hostConvexSchema, hostModules);
      const tag = TestConfect.TestConfect();
      expectTypeOf<typeof tag.Identifier>().toEqualTypeOf<
        TestConfect.TestConfect<DatabaseSchema.AnyApp>
      >();
      expectTypeOf<Layer.Success<typeof layer>>().toEqualTypeOf<
        typeof tag.Identifier
      >();
      const services = yield* Layer.build(layer);
      const t = Context.get(services, tag);
      yield* t.withIdentity({ name: "Ada" }).run(
        Effect.gen(function* () {
          const auth = yield* Auth.Auth;
          const identity = yield* auth.getUserIdentity;
          expect(identity.name).toBe("Ada");
        }),
      );
    }).pipe(Effect.scoped),
);

it.effect(
  "runs a generated component through vanilla Convex and scoped Confect runners",
  () =>
    Effect.gen(function* () {
      const t = convexTest(hostConvexSchema, hostModules);
      t.registerComponent("first", componentSchema, componentModules);
      t.registerComponent("second", componentSchema, componentModules);
      const wireId = yield* Effect.promise(() =>
        t.mutation(components.first.counter.create, { count: "2" }),
      );
      const wireDocs = yield* Effect.promise(() =>
        t.query(components.first.counter.list),
      );
      expect(wireDocs).toEqual([
        { _id: wireId, _creationTime: expect.any(Number), count: "2" },
      ]);

      const result = yield* Effect.promise(() =>
        t.run((ctx) =>
          // oxlint-disable-next-line effecttsgo/run-effect-inside-effect -- Convex invokes this callback in its transaction context; the handler needs its own per-call services.
          Effect.runPromise(
            Effect.gen(function* () {
              const { runMutation: mutation } =
                yield* MutationRunner.MutationRunner;
              const { runQuery: query } = yield* QueryRunner.QueryRunner;
              const id = yield* mutation(second.counter.create, { count: 7 });
              const failure = yield* Effect.result(
                mutation(first.counter.reject),
              );
              expect(Result.isFailure(failure)).toBe(true);
              if (Result.isFailure(failure))
                expect(failure.failure).toMatchObject({
                  _tag: "Rejected",
                  id: expect.any(String),
                });
              // Catching a typed component error must not commit its failed subtransaction.
              return {
                id,
                first: yield* query(first.counter.list),
                second: yield* query(second.counter.list),
              };
            }).pipe(
              Effect.provide(
                RegisteredConvexFunction.mutationLayer<typeof hostSchema>(
                  [],
                  ctx,
                ),
              ),
            ),
          ),
        ),
      );
      expect(Array.map(result.first, (row) => row.count)).toEqual([2]);
      expect(result.second).toEqual([
        { _id: result.id, _creationTime: expect.any(Number), count: 7 },
      ]);
      const own: Ref.Returns<typeof second.counter.create> = result.id;
      // @ts-expect-error Component installations have different ID types.
      const wrong: Ref.Returns<typeof first.counter.create> = result.id;
      void [own, wrong];
    }),
);

it.effect("registers components with TestConfect", () =>
  Effect.gen(function* () {
    const services = yield* Layer.build(
      TestConfect.layer<typeof hostSchema>([], hostConvexSchema, hostModules),
    );
    return yield* Effect.gen(function* () {
      const t = yield* TestConfect.TestConfect<typeof hostSchema>();
      const registered = yield* t.registerComponent<CounterApi<"first">>(
        "first",
        componentSchema,
        componentModules,
      );
      const bound = Component.bind(contract, registered);
      yield* t.mutation(first.counter.create, { count: 11 });
      const rows = yield* t.query(bound.counter.list);
      expect(Array.map(rows, (row) => row.count)).toEqual([11]);
    }).pipe(Effect.provide(services));
  }).pipe(Effect.scoped),
);

it.effect(
  "preserves component capabilities when running with or without a test identity",
  () =>
    Effect.gen(function* () {
      type Database = typeof componentDatabase;
      type Model = DataModel.ToConvexDataModel<
        DataModel.FromDatabaseSchema<Database>
      >;
      expectTypeOf<
        [typeof tableNames, typeof componentSchema, typeof componentModules]
      >().not.toExtend<Parameters<typeof TestConfect.layer<Database>>>();
      const services = yield* Layer.build(
        TestConfect.layer<Database>(
          tableNames,
          componentSchema,
          componentModules,
          target,
        ),
      );
      const test = Context.get(services, TestConfect.TestConfect<Database>());
      const check = Effect.gen(function* () {
        const auth = yield* Effect.serviceOption(Auth.Auth);
        const mutationAuth = yield* Effect.serviceOption(
          MutationAuth.MutationAuth,
        );
        expect(Option.isNone(auth)).toBe(true);
        expect(Option.isNone(mutationAuth)).toBe(true);
        const ctx = yield* MutationCtx.MutationCtx<
          Model,
          typeof target.scope
        >();
        expect("auth" in ctx).toBe(false);
      });
      yield* test.run(check);
      yield* test.withIdentity({ name: "Ada" }).run(check);
    }).pipe(Effect.scoped),
);
