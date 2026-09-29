import { FunctionSpec, Ref } from "@confect/core";
import * as QueryRunner from "@confect/server/QueryRunner";
import * as QueryTransactionContext from "@confect/server/QueryTransactionContext";
import * as MutationTransactionContext from "@confect/server/MutationTransactionContext";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { AdvancedRunQueryOptions, TransactionLimits } from "convex/server";
import { ConvexError } from "convex/values";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  id: Schema.String,
}) {}

const definition = {
  name: "count",
  args: () => ({ count: Schema.FiniteFromString }),
  returns: () => Schema.FiniteFromString,
  error: () => NotFound,
};
const ref = Ref.make("notes", FunctionSpec.publicQuery(definition));
const emptyRef = Ref.make(
  "notes",
  FunctionSpec.publicQuery({ name: "empty", returns: () => Schema.String }),
);

describe("QueryRunner", () => {
  it.effect(
    "encodes arguments and decodes results lazily on each execution",
    () => {
      const native = vi.fn().mockResolvedValue("2");
      return Effect.gen(function* () {
        const runner = yield* QueryRunner.QueryRunner;
        const args = { count: 1 };
        const operation = runner.runQuery(ref, args);
        expectTypeOf(operation).toEqualTypeOf<
          Effect.Effect<number, NotFound | Schema.SchemaError>
        >();
        expect(native).not.toHaveBeenCalled();
        expect(yield* operation).toBe(2);
        expect(yield* operation).toBe(2);
        expect(native).toHaveBeenCalledTimes(2);
        expect(native).toHaveBeenCalledWith(Ref.getFunctionReference(ref), {
          count: "1",
        });
        expect(args).toEqual({ count: 1 });
      }).pipe(Effect.provide(QueryRunner.layer(native)));
    },
  );

  it.effect(
    "uses the basic runner for omitted and explicitly undefined options",
    () => {
      const native = vi.fn().mockResolvedValue("ok");
      return Effect.gen(function* () {
        const runner = yield* QueryRunner.QueryRunner;
        const omitted = runner.runQuery(emptyRef);
        const explicit = runner.runQuery(emptyRef, undefined, undefined);
        expectTypeOf(omitted).toEqualTypeOf<
          Effect.Effect<string, Schema.SchemaError>
        >();
        expectTypeOf(explicit).toEqualTypeOf<
          Effect.Effect<string, Schema.SchemaError>
        >();
        expect(yield* omitted).toBe("ok");
        expect(yield* explicit).toBe("ok");
        expect(native).toHaveBeenNthCalledWith(
          1,
          Ref.getFunctionReference(emptyRef),
          {},
        );
        expect(native).toHaveBeenNthCalledWith(
          2,
          Ref.getFunctionReference(emptyRef),
          {},
        );
      }).pipe(Effect.provide(QueryRunner.layer(native)));
    },
  );

  it.effect(
    "routes every defined options object to the appropriate transaction controls",
    () => {
      const native = vi.fn().mockResolvedValue("basic");
      const queryNative = vi.fn().mockResolvedValue("query");
      const mutationNative = vi.fn().mockResolvedValue("mutation");
      const queryCtx = { runQuery: queryNative };
      const mutationCtx = { runQuery: mutationNative, runMutation: vi.fn() };
      return Effect.gen(function* () {
        const runner = yield* QueryRunner.QueryRunner;
        const limits = { transactionLimits: {} };
        expect(yield* runner.runQuery(emptyRef, {}, {})).toBe("query");
        expect(yield* runner.runQuery(emptyRef, {}, limits)).toBe("query");
        for (const useStaleSnapshot of [false, true]) {
          const options = { useStaleSnapshot };
          expect(yield* runner.runQuery(emptyRef, {}, options)).toBe(
            "mutation",
          );
          expect(mutationNative.mock.calls.at(-1)?.[2]).toBe(options);
        }
        expect(native).not.toHaveBeenCalled();
        expect(queryNative.mock.calls[1]?.[2]).toBe(limits);
        expect(queryNative.mock.contexts[0]).toBe(queryCtx);
        expect(mutationNative.mock.contexts[0]).toBe(mutationCtx);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            QueryRunner.layer(native),
            QueryTransactionContext.layer(queryCtx),
            MutationTransactionContext.layer(mutationCtx),
          ),
        ),
      );
    },
  );

  it.effect(
    "preserves declared errors, schema failures, and unknown defects",
    () => {
      const failure = new Error("offline");
      const native = vi
        .fn()
        .mockRejectedValueOnce(new ConvexError({ _tag: "NotFound", id: "abc" }))
        .mockResolvedValueOnce("not a number")
        .mockRejectedValueOnce(failure);
      return Effect.gen(function* () {
        const runner = yield* QueryRunner.QueryRunner;
        expect(yield* Effect.flip(runner.runQuery(ref, { count: 1 }))).toEqual(
          new NotFound({ id: "abc" }),
        );
        expect(
          yield* Effect.flip(runner.runQuery(ref, { count: 1 })),
        ).toBeInstanceOf(Schema.SchemaError);
        expect(
          yield* runner
            .runQuery(ref, { count: 1 })
            .pipe(Effect.catchDefect(Effect.succeed)),
        ).toBe(failure);
        expect(
          yield* Effect.flip(runner.runQuery(ref, { count: Number.NaN })),
        ).toBeInstanceOf(Schema.SchemaError);
        expect(native).toHaveBeenCalledTimes(3);
      }).pipe(Effect.provide(QueryRunner.layer(native)));
    },
  );

  it.effect(
    "dispatches widened options by their runtime value, including false and undefined",
    () => {
      const native = vi.fn().mockResolvedValue("basic");
      const query = vi.fn().mockResolvedValue("query");
      const mutation = vi.fn().mockResolvedValue("mutation");
      return Effect.gen(function* () {
        const runner = yield* QueryRunner.QueryRunner;
        const cases: ReadonlyArray<
          readonly [AdvancedRunQueryOptions | undefined, string]
        > = [
          [undefined, "basic"],
          [{}, "query"],
          [{ transactionLimits: {} }, "query"],
          [{ useStaleSnapshot: false }, "mutation"],
          [{ useStaleSnapshot: true }, "mutation"],
        ];
        for (const [options, expected] of cases) {
          expect(yield* runner.runQuery(emptyRef, {}, options)).toBe(expected);
        }
        expect(native).toHaveBeenCalledTimes(1);
        expect(query).toHaveBeenCalledTimes(2);
        expect(mutation).toHaveBeenCalledTimes(2);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            QueryRunner.layer(native),
            QueryTransactionContext.layer({ runQuery: query }),
            MutationTransactionContext.layer({
              runQuery: mutation,
              runMutation: vi.fn(),
            }),
          ),
        ),
      );
    },
  );

  it.effect(
    "tracks options variables and unions conservatively without weakening ref types",
    () =>
      Effect.gen(function* () {
        const runner = yield* QueryRunner.QueryRunner;
        const check = (
          broad: AdvancedRunQueryOptions,
          maybe: AdvancedRunQueryOptions | undefined,
          limits: {
            transactionLimits?: TransactionLimits;
            useStaleSnapshot?: never;
          },
          maybeLimits: { transactionLimits?: TransactionLimits } | undefined,
          stale: { useStaleSnapshot: boolean },
          optionalFalse: { useStaleSnapshot?: false },
          maybeStale: { useStaleSnapshot: boolean } | undefined,
          union:
            | { transactionLimits: TransactionLimits }
            | { useStaleSnapshot: boolean },
        ) => {
          expectTypeOf(runner.runQuery(ref, { count: 1 }, broad)).toEqualTypeOf<
            Effect.Effect<
              number,
              NotFound | Schema.SchemaError,
              | QueryTransactionContext.QueryTransactionContext
              | MutationTransactionContext.MutationTransactionContext
            >
          >();
          expectTypeOf(runner.runQuery(ref, { count: 1 }, maybe)).toEqualTypeOf<
            Effect.Effect<
              number,
              NotFound | Schema.SchemaError,
              | QueryTransactionContext.QueryTransactionContext
              | MutationTransactionContext.MutationTransactionContext
            >
          >();
          expectTypeOf(
            runner.runQuery(ref, { count: 1 }, limits),
          ).toEqualTypeOf<
            Effect.Effect<
              number,
              NotFound | Schema.SchemaError,
              QueryTransactionContext.QueryTransactionContext
            >
          >();
          expectTypeOf(
            runner.runQuery(ref, { count: 1 }, maybeLimits),
          ).toEqualTypeOf<
            Effect.Effect<
              number,
              NotFound | Schema.SchemaError,
              QueryTransactionContext.QueryTransactionContext
            >
          >();
          expectTypeOf(runner.runQuery(ref, { count: 1 }, stale)).toEqualTypeOf<
            Effect.Effect<
              number,
              NotFound | Schema.SchemaError,
              MutationTransactionContext.MutationTransactionContext
            >
          >();
          expectTypeOf(runner.runQuery(ref, { count: 1 }, union)).toEqualTypeOf<
            Effect.Effect<
              number,
              NotFound | Schema.SchemaError,
              | QueryTransactionContext.QueryTransactionContext
              | MutationTransactionContext.MutationTransactionContext
            >
          >();
          expectTypeOf(
            runner.runQuery(ref, { count: 1 }, optionalFalse),
          ).toEqualTypeOf<
            Effect.Effect<
              number,
              NotFound | Schema.SchemaError,
              | QueryTransactionContext.QueryTransactionContext
              | MutationTransactionContext.MutationTransactionContext
            >
          >();
          expectTypeOf(
            runner.runQuery(ref, { count: 1 }, maybeStale),
          ).toEqualTypeOf<
            Effect.Effect<
              number,
              NotFound | Schema.SchemaError,
              | QueryTransactionContext.QueryTransactionContext
              | MutationTransactionContext.MutationTransactionContext
            >
          >();
          expectTypeOf(
            runner.runQuery(ref, { count: 1 }, { useStaleSnapshot: false }),
          ).toEqualTypeOf<
            Effect.Effect<
              number,
              NotFound | Schema.SchemaError,
              MutationTransactionContext.MutationTransactionContext
            >
          >();
          expectTypeOf(
            Ref.make("notes", FunctionSpec.publicMutation(definition)),
          ).not.toExtend<Parameters<typeof runner.runQuery>[0]>();
          expectTypeOf(
            // @ts-expect-error Required arguments cannot be omitted.
            runner.runQuery(ref),
          );
          expectTypeOf(
            // @ts-expect-error Arguments use decoded rather than encoded values.
            runner.runQuery(ref, { count: "1" }, broad),
          );
        };
        expectTypeOf(check).toBeFunction();
      }).pipe(Effect.provide(QueryRunner.layer(vi.fn()))),
  );
});
