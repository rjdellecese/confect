import { FunctionSpec, Ref } from "@confect/core";
import { QueryTransactionContext as BarrelControls } from "@confect/server";
import * as QueryTransactionContext from "@confect/server/QueryTransactionContext";
import type { MutationTransactionContext } from "@confect/server/MutationTransactionContext";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { TransactionLimits } from "convex/server";
import { ConvexError } from "convex/values";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  id: Schema.String,
}) {}

const ref = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "count",
    args: () => ({ count: Schema.FiniteFromString }),
    returns: () => Schema.FiniteFromString,
    error: () => NotFound,
  }),
);

describe("QueryTransactionContext", () => {
  it("exports a distinct nominal service and native limit types", () => {
    expect(BarrelControls.QueryTransactionContext).toBe(
      QueryTransactionContext.QueryTransactionContext,
    );
    expectTypeOf<QueryTransactionContext.TransactionLimits>().toEqualTypeOf<TransactionLimits>();
    expectTypeOf<QueryTransactionContext.QueryTransactionContext>().not.toExtend<MutationTransactionContext>();
    expectTypeOf<MutationTransactionContext>().not.toExtend<QueryTransactionContext.QueryTransactionContext>();
  });

  it.effect(
    "invokes lazily with codecs, unchanged options, and the original context receiver",
    () => {
      const runQuery = vi.fn().mockResolvedValue("2");
      const ctx = { runQuery };
      const layer = QueryTransactionContext.layer(ctx);
      expect(runQuery).not.toHaveBeenCalled();
      return Effect.gen(function* () {
        const controls = yield* QueryTransactionContext.QueryTransactionContext;
        const args = { count: 1 };
        const options = { transactionLimits: {} };
        const operation = controls.runQuery(ref, args, options);
        expectTypeOf(operation).toEqualTypeOf<
          Effect.Effect<number, NotFound | Schema.SchemaError>
        >();
        expect(runQuery).not.toHaveBeenCalled();
        expect(yield* operation).toBe(2);
        expect(yield* operation).toBe(2);
        expect(runQuery).toHaveBeenCalledTimes(2);
        expect(runQuery).toHaveBeenCalledWith(
          Ref.getFunctionReference(ref),
          { count: "1" },
          options,
        );
        expect(runQuery.mock.calls[0]?.[2]).toBe(options);
        expect(runQuery.mock.calls[1]?.[2]).toBe(options);
        expect(runQuery.mock.contexts).toEqual([ctx, ctx]);
        expect(args).toEqual({ count: 1 });
        expect(options).toEqual({ transactionLimits: {} });
        const check = () => {
          expectTypeOf(
            // @ts-expect-error Query controls cannot request stale snapshots.
            controls.runQuery(ref, args, { useStaleSnapshot: false }),
          );
          expectTypeOf(
            // @ts-expect-error The direct control operation requires options.
            controls.runQuery(ref, args),
          );
          expectTypeOf(
            // @ts-expect-error Codec arguments must use decoded values.
            controls.runQuery(ref, { count: "1" }, options),
          );
        };
        expectTypeOf(check).toBeFunction();
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect(
    "preserves declared failures and schema errors without converting unknown defects",
    () => {
      const defect = new Error("offline");
      const runQuery = vi
        .fn()
        .mockRejectedValueOnce(new ConvexError({ _tag: "NotFound", id: "abc" }))
        .mockResolvedValueOnce("invalid")
        .mockRejectedValueOnce(defect);
      return Effect.gen(function* () {
        const controls = yield* QueryTransactionContext.QueryTransactionContext;
        expect(
          yield* Effect.flip(controls.runQuery(ref, { count: 1 }, {})),
        ).toEqual(new NotFound({ id: "abc" }));
        expect(
          yield* Effect.flip(controls.runQuery(ref, { count: 1 }, {})),
        ).toBeInstanceOf(Schema.SchemaError);
        expect(
          yield* controls
            .runQuery(ref, { count: 1 }, {})
            .pipe(Effect.catchDefect(Effect.succeed)),
        ).toBe(defect);
        expect(
          yield* Effect.flip(controls.runQuery(ref, { count: Number.NaN }, {})),
        ).toBeInstanceOf(Schema.SchemaError);
        expect(runQuery).toHaveBeenCalledTimes(3);
      }).pipe(Effect.provide(QueryTransactionContext.layer({ runQuery })));
    },
  );
});
