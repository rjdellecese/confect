import { assert, describe, expect, expectTypeOf, it } from "@effect/vitest";
import { FunctionSpec, GroupSpec, MiddlewareSpec, Ref } from "@confect/core";
import {
  FunctionImpl,
  GroupImpl,
  MiddlewareImpl,
  RegisteredConvexFunction,
  RegisteredFunctions,
} from "@confect/server";
import { TestConfect as TestConfect_ } from "../../../test/src";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import databaseSchema from "./fixtures/confect/_generated/schema";
import convexSchema from "./fixtures/confect/_generated/convexSchema";
import { NameRejected } from "./fixtures/confect/middleware/RequireName.spec";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import refs from "./fixtures/confect/_generated/refs";
import {
  DatabaseReader,
  DatabaseWriter,
} from "./fixtures/confect/_generated/services";
import { NoNotes } from "./fixtures/confect/groups/middleware.spec";
import { GateClosed } from "./fixtures/confect/middleware/Gate.spec";
import { NoViewer } from "./fixtures/confect/middleware/ProvideViewer.spec";
import { FunctionGateClosed } from "./fixtures/confect/middleware/RecordFunctionLevel.spec";
import { NameTooShort } from "./fixtures/confect/middleware/RequireLongName.spec";
import * as TestConfect from "./TestConfect";

const expectFailure = <A, E>(result: Result.Result<A, E>): E => {
  assert(Result.isFailure(result));
  return result.failure;
};

const insertUser = Effect.fnUntraced(function* (username: string) {
  const c = yield* TestConfect.TestConfect;
  yield* c.run(
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      yield* writer.table("users").insert({ username });
    }),
  );
}, Effect.orDie);

const listNoteTexts = Effect.gen(function* () {
  const c = yield* TestConfect.TestConfect;
  return yield* c.run(
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const notes = yield* reader
        .table("notes")
        .index("by_creation_time", "asc")
        .collect();
      return Array.map(notes, (note) => note.text);
    }),
    Schema.mutable(Schema.Array(Schema.String)),
  );
}).pipe(Effect.orDie);

describe("middleware", () => {
  describe("provides", () => {
    it.effect("provides a service to a query handler", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        yield* insertUser("ada");

        const name = yield* c.query(refs.public.groups.middleware.viewerName);

        expect(name).toBe("ada");
      }).pipe(Effect.provide(TestConfect.layer)),
    );

    it.effect("provides a service to a mutation handler", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        yield* insertUser("grace");

        const name = yield* c.mutation(
          refs.public.groups.middleware.viewerNameMutation,
        );

        expect(name).toBe("grace");
      }).pipe(Effect.provide(TestConfect.layer)),
    );

    it.effect(
      "provides a service to an action handler via the per-function-type QueryRunner strategy",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          yield* insertUser("alan");

          const name = yield* c.action(
            refs.public.groups.middleware.viewerNameAction,
          );

          expect(name).toBe("alan");
        }).pipe(Effect.provide(TestConfect.layer)),
    );
  });

  describe("typed errors", () => {
    it.effect(
      "middleware short-circuit surfaces as its typed error on a query",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;

          const result = yield* Effect.result(
            c.query(refs.public.groups.middleware.viewerName),
          );

          expect(expectFailure(result)).toBeInstanceOf(NoViewer);
        }).pipe(Effect.provide(TestConfect.layer)),
    );

    it.effect(
      "middleware short-circuit surfaces as its typed error on an action",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;

          const result = yield* Effect.result(
            c.action(refs.public.groups.middleware.viewerNameAction),
          );

          expect(expectFailure(result)).toBeInstanceOf(NoViewer);
        }).pipe(Effect.provide(TestConfect.layer)),
    );

    it.effect(
      "a function's own error and its middleware's error both decode on the client",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;

          // No users: the middleware short-circuits.
          const noViewer = yield* Effect.result(
            c.query(refs.public.groups.middleware.firstNoteForViewer),
          );
          expect(expectFailure(noViewer)).toBeInstanceOf(NoViewer);

          // A user but no notes: the handler's own error.
          yield* insertUser("ada");
          const noNotes = yield* Effect.result(
            c.query(refs.public.groups.middleware.firstNoteForViewer),
          );
          expect(expectFailure(noNotes)).toBeInstanceOf(NoNotes);
        }).pipe(Effect.provide(TestConfect.layer)),
    );

    it("types a covered function's ref error as the union of its own and its middleware's errors", () => {
      expectTypeOf<
        Ref.Error<typeof refs.public.groups.middleware.firstNoteForViewer>
      >().toEqualTypeOf<NoNotes | NoViewer>();
      expectTypeOf<
        Ref.Error<typeof refs.public.groups.middleware.viewerName>
      >().toEqualTypeOf<NoViewer>();
    });
  });

  describe("cross-middleware requires", () => {
    it.effect(
      "a middleware consumes a service provided by an earlier middleware",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          yield* insertUser("ada");

          const shouted = yield* c.query(
            refs.public.groups.middleware.shoutName,
          );

          expect(shouted).toBe("ADA");
        }).pipe(Effect.provide(TestConfect.layer)),
    );

    it.effect("fails with its own typed error using the required service", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        yield* insertUser("ab");

        const result = yield* Effect.result(
          c.query(refs.public.groups.middleware.shoutName),
        );

        expect(expectFailure(result)).toBeInstanceOf(NameTooShort);
      }).pipe(Effect.provide(TestConfect.layer)),
    );

    it.effect("the providing middleware's short-circuit still runs first", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const result = yield* Effect.result(
          c.query(refs.public.groups.middleware.shoutName),
        );

        expect(expectFailure(result)).toBeInstanceOf(NoViewer);
      }).pipe(Effect.provide(TestConfect.layer)),
    );

    it("joins both middlewares' errors in the covered function's ref union", () => {
      expectTypeOf<
        Ref.Error<typeof refs.public.groups.middleware.shoutName>
      >().toEqualTypeOf<NoViewer | NameTooShort>();
    });
  });

  describe("ordering and short-circuiting", () => {
    it.effect(
      "group middleware run in attachment order, then function-level middleware, then the handler",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;

          yield* c.mutation(refs.public.groups.middlewareOrder.record, {
            blocked: false,
            blockedAtFunction: false,
          });

          const texts = yield* listNoteTexts;
          expect(texts).toStrictEqual([
            "first",
            "second",
            "function",
            "handler",
          ]);
        }).pipe(Effect.provide(TestConfect.layer)),
    );

    it.effect(
      "an outer middleware's short-circuit skips inner middleware and the handler",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;

          const result = yield* Effect.result(
            c.mutation(refs.public.groups.middlewareOrder.record, {
              blocked: true,
              blockedAtFunction: false,
            }),
          );

          const error = expectFailure(result);
          assert(Schema.is(GateClosed)(error));
          expect(error.reason).toBe("blocked by gate");

          const texts = yield* listNoteTexts;
          expect(texts).toStrictEqual([]);
        }).pipe(Effect.provide(TestConfect.layer)),
    );
  });

  describe("function-level middleware", () => {
    it.effect(
      "runs inside the group chain and short-circuits with its typed error",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;

          const result = yield* Effect.result(
            c.mutation(refs.public.groups.middlewareOrder.record, {
              blocked: false,
              blockedAtFunction: true,
            }),
          );

          expect(expectFailure(result)).toBeInstanceOf(FunctionGateClosed);

          // The group middleware ran first (the ordering test above observes
          // that), but a failed mutation rolls back its whole transaction—the markers they inserted are rolled back along with it.
          const texts = yield* listNoteTexts;
          expect(texts).toStrictEqual([]);
        }).pipe(Effect.provide(TestConfect.layer)),
    );

    it.effect("does not cover the group's other functions", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        yield* c.mutation(refs.public.groups.middlewareOrder.recordPlain);

        const texts = yield* listNoteTexts;
        expect(texts).toStrictEqual(["first", "second", "handler"]);
      }).pipe(Effect.provide(TestConfect.layer)),
    );

    it("adds its error to the covered function's ref union only", () => {
      expectTypeOf<
        Ref.Error<typeof refs.public.groups.middlewareOrder.record>
      >().toEqualTypeOf<GateClosed | FunctionGateClosed>();
      expectTypeOf<
        Ref.Error<typeof refs.public.groups.middlewareOrder.recordPlain>
      >().toEqualTypeOf<GateClosed>();
    });
  });

  describe("per-attachment options", () => {
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

    class UndefinedPolicy extends MiddlewareSpec.MiddlewareSpec<UndefinedPolicy>()(
      "UndefinedPolicy",
      {
        options: () => Schema.Undefined,
        functionTypes: { query: true, mutation: true, action: true },
      },
    ) {}

    it.effect(
      "passes typed options through both implementation strategies in attachment order",
      () =>
        Effect.gen(function* () {
          const events: globalThis.Array<string> = [];
          const query = FunctionSpec.publicQuery({
            name: "get",
            args: () => ({ id: Schema.String }),
            returns: () => Schema.String,
          })
            .middleware(FunctionPolicy, { tolerateMissing: true })
            .middleware(GroupPolicy, { label: "inner" })
            .middleware(UndefinedPolicy, undefined)
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
                (effect, context) => {
                  return Effect.gen(function* () {
                    expect(context).toEqual({
                      options: { label: context.options.label },
                      invocation: {
                        name: "get",
                        functionType: "query",
                        functionVisibility: "public",
                        args: { id: "decoded" },
                      },
                    });
                    events.push(context.options.label);
                    const result = yield* effect;
                    events.push(`${context.options.label}:after`);
                    return result;
                  });
                },
              ),
            ),
            Layer.provide(
              MiddlewareImpl.makeByFunctionType(
                databaseSchema,
                FunctionPolicy,
                {
                  query: (effect, { options, invocation }) => {
                    return Effect.gen(function* () {
                      expect(options.tolerateMissing).toBe(true);
                      expect(invocation).toEqual({
                        name: "get",
                        functionType: "query",
                        functionVisibility: "public",
                        args: { id: "decoded" },
                      });
                      events.push("function");
                      return yield* effect;
                    });
                  },
                  mutation: (effect) => effect,
                  action: (effect) => effect,
                },
              ),
            ),
            Layer.provide(
              MiddlewareImpl.make(
                databaseSchema,
                Observe,
                (effect, context) => {
                  expect(Object.hasOwn(context, "options")).toBe(false);
                  expect(context).toStrictEqual({
                    invocation: {
                      name: "get",
                      functionType: "query",
                      functionVisibility: "public",
                      args: { id: "decoded" },
                    },
                  });
                  return effect;
                },
              ),
            ),
            Layer.provide(
              MiddlewareImpl.makeByFunctionType(
                databaseSchema,
                UndefinedPolicy,
                {
                  query: (effect, context) => {
                    expect(Object.hasOwn(context, "options")).toBe(true);
                    expect(context).toStrictEqual({
                      options: undefined,
                      invocation: {
                        name: "get",
                        functionType: "query",
                        functionVisibility: "public",
                        args: { id: "decoded" },
                      },
                    });
                    return effect;
                  },
                  mutation: (effect) => effect,
                  action: (effect) => effect,
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
          const c = yield* Effect.service(TestConfect.TestConfect).pipe(
            Effect.provide(
              TestConfect_.layer(databaseSchema, convexSchema, {
                ...import.meta.glob("./fixtures/convex/_generated/*.js"),
                "./fixtures/convex/options.ts": () =>
                  Promise.resolve(registered),
              }),
            ),
          );
          expect(
            yield* c.query(Ref.make("options", query), { id: "decoded" }),
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

    it.effect("lets the inner instance shadow the same provided service", () =>
      Effect.gen(function* () {
        class Value extends Context.Service<Value, string>()(
          "@confect/server/test/mock-backend/middleware.test/Value",
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
        const c = yield* Effect.service(TestConfect.TestConfect).pipe(
          Effect.provide(
            TestConfect_.layer(databaseSchema, convexSchema, {
              ...import.meta.glob("./fixtures/convex/_generated/*.js"),
              "./fixtures/convex/options.ts": () => Promise.resolve(registered),
            }),
          ),
        );
        expect(yield* c.query(Ref.make("options", query))).toBe("inner");
      }),
    );

    it.effect(
      "carries per-attachment options through codegen, execution, and client error decoding",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          yield* c.run(
            Effect.gen(function* () {
              const writer = yield* DatabaseWriter;
              yield* writer.table("users").insert({ username: "ada" });
            }),
          );
          const group = refs.public.groups.middlewareOptions;
          expectTypeOf<Ref.Error<typeof group.shortName>>().toEqualTypeOf<
            NoViewer | NameRejected
          >();
          expect(group.shortName.middlewareAttachments[2]?.options).toEqual({
            minLength: 2,
          });
          expect(group.longName.middlewareAttachments[2]?.options).toEqual({
            minLength: 5,
          });
          expect(yield* c.query(group.shortName)).toBe("ada");
          expect(yield* Effect.result(c.query(group.longName))).toEqual(
            Result.fail(new NameRejected({ minLength: 5 })),
          );
          expect(yield* Effect.result(c.mutation(group.mutation))).toEqual(
            Result.fail(new NameRejected({ minLength: 4 })),
          );
          expect(yield* Effect.result(c.action(group.action))).toEqual(
            Result.fail(new NameRejected({ minLength: 6 })),
          );
          expect(yield* c.query(group.shortName)).toBe("ada");
        }).pipe(Effect.provide(TestConfect.layer)),
    );
  });
});
