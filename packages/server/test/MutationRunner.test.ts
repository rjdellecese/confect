import { FunctionSpec, Ref } from "@confect/core";
import * as MutationRunner from "@confect/server/MutationRunner";
import * as MutationTransactionContext from "@confect/server/MutationTransactionContext";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { TransactionLimits } from "convex/server";
import { ConvexError } from "convex/values";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

class NotFound extends Schema.TaggedError<
  NotFound,
  { readonly brand: unique symbol }
>()("NotFound", {
  id: Schema.String,
}) {}

const definition = {
  name: "count",
  args: () => ({ count: Schema.FiniteFromString }),
  returns: () => Schema.FiniteFromString,
  error: () => NotFound,
};
const ref = Ref.make("notes", FunctionSpec.publicMutation(definition));
const emptyRef = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "empty",
    returns: () => Schema.String,
  }),
);

describe("MutationRunner", () => {
  it.effect(
    "encodes arguments and decodes results lazily on each execution",
    () => {
      const native = vi.fn().mockResolvedValue("2");
      return Effect.gen(function* () {
        const services = yield* Layer.build(MutationRunner.layer(native));
        return yield* Effect.gen(function* () {
          const runner = yield* MutationRunner.MutationRunner;
          const args = { count: 1 };
          const operation = runner.runMutation(ref, args);
          expectTypeOf(operation).toEqualTypeOf<
            Effect.Effect<number, NotFound | Schema.SchemaError>
          >();
          expect(native).not.toHaveBeenCalled();
          const operationResult = yield* operation;
          expect(operationResult).toBe(2);
          const operationResult2 = yield* operation;
          expect(operationResult2).toBe(2);
          expect(native).toHaveBeenCalledTimes(2);
          expect(native).toHaveBeenCalledWith(Ref.getFunctionReference(ref), {
            count: "1",
          });
          expect(args).toEqual({ count: 1 });
        }).pipe(Effect.provideContext(services));
      }).pipe(Effect.scoped);
    },
  );

  it.effect(
    "uses the basic runner for omitted and explicitly undefined options",
    () => {
      const native = vi.fn().mockResolvedValue("ok");
      return Effect.gen(function* () {
        const services = yield* Layer.build(MutationRunner.layer(native));
        return yield* Effect.gen(function* () {
          const runner = yield* MutationRunner.MutationRunner;
          const omitted = runner.runMutation(emptyRef);
          const explicit = runner.runMutation(emptyRef, undefined, undefined);
          expectTypeOf(omitted).toEqualTypeOf<
            Effect.Effect<string, Schema.SchemaError>
          >();
          expectTypeOf(explicit).toEqualTypeOf<
            Effect.Effect<string, Schema.SchemaError>
          >();
          const omittedResult = yield* omitted;
          expect(omittedResult).toBe("ok");
          const explicitResult = yield* explicit;
          expect(explicitResult).toBe("ok");
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
        }).pipe(Effect.provideContext(services));
      }).pipe(Effect.scoped);
    },
  );

  it.effect(
    "routes defined options to mutation controls without changing their identity",
    () => {
      const native = vi.fn().mockResolvedValue("basic");
      const runMutation = vi.fn().mockResolvedValue("controlled");
      const ctx = { runQuery: vi.fn(), runMutation };
      return Effect.gen(function* () {
        const runner = yield* MutationRunner.MutationRunner;
        for (const options of [{}, { transactionLimits: {} }]) {
          const runMutationResult = yield* runner.runMutation(
            emptyRef,
            {},
            options,
          );
          expect(runMutationResult).toBe("controlled");
          expect(runMutation.mock.calls.at(-1)?.[2]).toBe(options);
          expect(runMutation.mock.contexts.at(-1)).toBe(ctx);
        }
        expect(native).not.toHaveBeenCalled();
      }).pipe(
        Effect.provide([
          MutationRunner.layer(native),
          MutationTransactionContext.layer(ctx),
        ]),
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
        const services = yield* Layer.build(MutationRunner.layer(native));
        return yield* Effect.gen(function* () {
          const runner = yield* MutationRunner.MutationRunner;
          const flipResult = yield* Effect.flip(
            runner.runMutation(ref, { count: 1 }),
          );
          expect(flipResult).toEqual(NotFound.make({ id: "abc" }));
          const flipResult2 = yield* Effect.flip(
            runner.runMutation(ref, { count: 1 }),
          );
          expect(flipResult2).toBeInstanceOf(Schema.SchemaError);
          const pipeResult = yield* runner
            .runMutation(ref, { count: 1 })
            .pipe(Effect.catchDefect(Effect.succeed));
          expect(pipeResult).toBe(failure);
          const flipResult3 = yield* Effect.flip(
            runner.runMutation(ref, { count: Number.NaN }),
          );
          expect(flipResult3).toBeInstanceOf(Schema.SchemaError);
          expect(native).toHaveBeenCalledTimes(3);
        }).pipe(Effect.provideContext(services));
      }).pipe(Effect.scoped);
    },
  );

  it.effect(
    "dispatches optional options variables by their runtime value",
    () => {
      const native = vi.fn().mockResolvedValue("basic");
      const runMutation = vi.fn().mockResolvedValue("controlled");
      return Effect.gen(function* () {
        const runner = yield* MutationRunner.MutationRunner;
        const options: ReadonlyArray<
          { transactionLimits?: TransactionLimits } | undefined
        > = [undefined, {}, { transactionLimits: {} }];
        for (const value of options) {
          const runMutationResult2 = yield* runner.runMutation(
            emptyRef,
            {},
            value,
          );
          expect(runMutationResult2).toBe(
            value === undefined ? "basic" : "controlled",
          );
        }
        expect(native).toHaveBeenCalledTimes(1);
        expect(runMutation).toHaveBeenCalledTimes(2);
      }).pipe(
        Effect.provide([
          MutationRunner.layer(native),
          MutationTransactionContext.layer({
            runQuery: vi.fn(),
            runMutation,
          }),
        ]),
      );
    },
  );

  it.effect(
    "requires mutation controls for options variables including optional ones",
    () =>
      Effect.gen(function* () {
        const services = yield* Layer.build(MutationRunner.layer(vi.fn()));
        return yield* Effect.gen(function* () {
          const runner = yield* MutationRunner.MutationRunner;
          const check = (
            options: { transactionLimits?: TransactionLimits },
            maybe: { transactionLimits?: TransactionLimits } | undefined,
          ) => {
            expectTypeOf(
              runner.runMutation(ref, { count: 1 }, options),
            ).toEqualTypeOf<
              Effect.Effect<
                number,
                NotFound | Schema.SchemaError,
                MutationTransactionContext.MutationTransactionContext
              >
            >();
            expectTypeOf(
              runner.runMutation(ref, { count: 1 }, maybe),
            ).toEqualTypeOf<
              Effect.Effect<
                number,
                NotFound | Schema.SchemaError,
                MutationTransactionContext.MutationTransactionContext
              >
            >();
            expectTypeOf(
              Ref.make("notes", FunctionSpec.publicQuery(definition)),
            ).not.toExtend<Parameters<typeof runner.runMutation>[0]>();
            expectTypeOf(
              // @ts-expect-error Required arguments cannot be omitted.
              runner.runMutation(ref),
            );
            expectTypeOf(
              // @ts-expect-error Arguments use decoded rather than encoded values.
              runner.runMutation(ref, { count: "1" }, options),
            );
            expectTypeOf(
              // @ts-expect-error Stale snapshots are query options, not mutation options.
              runner.runMutation(ref, { count: 1 }, { useStaleSnapshot: true }),
            );
          };
          expectTypeOf(check).toBeFunction();
        }).pipe(Effect.provideContext(services));
      }).pipe(Effect.scoped),
  );
});
