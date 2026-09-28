import { FunctionSpec, Ref } from "@confect/core";
import { MutationTransactionContext as BarrelControls } from "@confect/server";
import * as MutationTransactionContext from "@confect/server/MutationTransactionContext";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { AdvancedRunQueryOptions, TransactionLimits } from "convex/server";
import { ConvexError } from "convex/values";
import * as Effect from "effect/Effect";
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
const queryRef = Ref.make("notes", FunctionSpec.publicQuery(definition));
const mutationRef = Ref.make("notes", FunctionSpec.publicMutation(definition));

describe("MutationTransactionContext", () => {
  it("exports the same service through the barrel and native option types", () => {
    expect(BarrelControls.MutationTransactionContext).toBe(
      MutationTransactionContext.MutationTransactionContext,
    );
    expectTypeOf<MutationTransactionContext.TransactionLimits>().toEqualTypeOf<TransactionLimits>();
    expectTypeOf<MutationTransactionContext.QueryOptions>().toEqualTypeOf<AdvancedRunQueryOptions>();
  });

  it.effect(
    "runs queries and mutations lazily with codecs and the original receiver and options",
    () => {
      const runQuery = vi.fn().mockResolvedValue("2");
      const runMutation = vi.fn().mockResolvedValue("3");
      const ctx = { runQuery, runMutation };
      const layer = MutationTransactionContext.layer(ctx);
      expect(runQuery).not.toHaveBeenCalled();
      expect(runMutation).not.toHaveBeenCalled();
      return Effect.gen(function* () {
        const controls =
          yield* MutationTransactionContext.MutationTransactionContext;
        const args = { count: 1 };
        const queryOptions = { transactionLimits: {}, useStaleSnapshot: false };
        const mutationOptions = { transactionLimits: {} };
        const query = controls.runQuery(queryRef, args, queryOptions);
        const mutation = controls.runMutation(
          mutationRef,
          args,
          mutationOptions,
        );
        expectTypeOf(query).toEqualTypeOf<
          Effect.Effect<number, NotFound | Schema.SchemaError>
        >();
        expectTypeOf(mutation).toEqualTypeOf<
          Effect.Effect<number, NotFound | Schema.SchemaError>
        >();
        expect(runQuery).not.toHaveBeenCalled();
        expect(runMutation).not.toHaveBeenCalled();
        expect(yield* query).toBe(2);
        expect(yield* mutation).toBe(3);
        expect(yield* query).toBe(2);
        expect(yield* mutation).toBe(3);
        expect(runQuery).toHaveBeenCalledWith(
          Ref.getFunctionReference(queryRef),
          { count: "1" },
          queryOptions,
        );
        expect(runMutation).toHaveBeenCalledWith(
          Ref.getFunctionReference(mutationRef),
          { count: "1" },
          mutationOptions,
        );
        expect(runQuery.mock.calls[0]?.[2]).toBe(queryOptions);
        expect(runMutation.mock.calls[0]?.[2]).toBe(mutationOptions);
        expect(runQuery.mock.contexts).toEqual([ctx, ctx]);
        expect(runMutation.mock.contexts).toEqual([ctx, ctx]);
        expect(args).toEqual({ count: 1 });
        expect(queryOptions).toEqual({
          transactionLimits: {},
          useStaleSnapshot: false,
        });
        expect(mutationOptions).toEqual({ transactionLimits: {} });
        const check = () => {
          expectTypeOf(mutationRef).not.toExtend<
            Parameters<typeof controls.runQuery>[0]
          >();
          expectTypeOf(queryRef).not.toExtend<
            Parameters<typeof controls.runMutation>[0]
          >();
          expectTypeOf(
            controls.runMutation(mutationRef, args, {
              // @ts-expect-error Mutation controls do not accept stale-snapshot mutation options.
              useStaleSnapshot: false,
            }),
          );
        };
        expectTypeOf(check).toBeFunction();
      }).pipe(Effect.provide(layer));
    },
  );

  for (const kind of ["query", "mutation"] as const) {
    it.effect(
      `preserves declared errors, codec failures, and defects for ${kind}`,
      () => {
        const defect = new Error("offline");
        const native = vi
          .fn()
          .mockRejectedValueOnce(
            new ConvexError({ _tag: "NotFound", id: "abc" }),
          )
          .mockResolvedValueOnce("invalid")
          .mockRejectedValueOnce(defect);
        return Effect.gen(function* () {
          const controls =
            yield* MutationTransactionContext.MutationTransactionContext;
          const run = (count: number) =>
            kind === "query"
              ? controls.runQuery(
                  queryRef,
                  { count },
                  { useStaleSnapshot: true },
                )
              : controls.runMutation(mutationRef, { count }, {});
          expect(yield* Effect.flip(run(1))).toEqual(
            new NotFound({ id: "abc" }),
          );
          expect(yield* Effect.flip(run(1))).toBeInstanceOf(Schema.SchemaError);
          expect(yield* run(1).pipe(Effect.catchDefect(Effect.succeed))).toBe(
            defect,
          );
          expect(yield* Effect.flip(run(Number.NaN))).toBeInstanceOf(
            Schema.SchemaError,
          );
          expect(native).toHaveBeenCalledTimes(3);
        }).pipe(
          Effect.provide(
            MutationTransactionContext.layer({
              runQuery: native,
              runMutation: native,
            }),
          ),
        );
      },
    );
  }
});
