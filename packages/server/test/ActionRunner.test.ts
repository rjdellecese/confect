import { FunctionSpec, Ref } from "@confect/core";
import * as ActionRunner from "@confect/server/ActionRunner";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
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
const ref = Ref.make("notes", FunctionSpec.publicAction(definition));
const emptyRef = Ref.make(
  "notes",
  FunctionSpec.publicAction({ name: "empty", returns: () => Schema.String }),
);

describe("ActionRunner", () => {
  it.effect(
    "encodes arguments and decodes results lazily on each execution",
    () => {
      const native = vi.fn().mockResolvedValue("2");
      return Effect.gen(function* () {
        const runner = yield* ActionRunner.ActionRunner;
        const args = { count: 1 };
        const operation = runner.runAction(ref, args);
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
      }).pipe(Effect.provide(ActionRunner.layer(native)));
    },
  );

  it.effect(
    "allows omitted arguments only for empty-argument references",
    () => {
      const native = vi.fn().mockResolvedValue("ok");
      return Effect.gen(function* () {
        const runner = yield* ActionRunner.ActionRunner;
        expect(yield* runner.runAction(emptyRef)).toBe("ok");
        expect(native).toHaveBeenCalledWith(
          Ref.getFunctionReference(emptyRef),
          {},
        );
        const check = () => {
          expectTypeOf(
            Ref.make("notes", FunctionSpec.publicQuery(definition)),
          ).not.toExtend<Parameters<typeof runner.runAction>[0]>();
          expectTypeOf(
            // @ts-expect-error Required arguments cannot be omitted.
            runner.runAction(ref),
          );
          expectTypeOf(
            // @ts-expect-error Arguments use decoded rather than encoded values.
            runner.runAction(ref, { count: "1" }),
          );
          expectTypeOf(
            // @ts-expect-error Actions do not support transaction options.
            runner.runAction(ref, { count: 1 }, { transactionLimits: {} }),
          );
        };
        expectTypeOf(check).toBeFunction();
      }).pipe(Effect.provide(ActionRunner.layer(native)));
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
        const runner = yield* ActionRunner.ActionRunner;
        expect(yield* Effect.flip(runner.runAction(ref, { count: 1 }))).toEqual(
          new NotFound({ id: "abc" }),
        );
        expect(
          yield* Effect.flip(runner.runAction(ref, { count: 1 })),
        ).toBeInstanceOf(Schema.SchemaError);
        expect(
          yield* runner
            .runAction(ref, { count: 1 })
            .pipe(Effect.catchDefect(Effect.succeed)),
        ).toBe(failure);
        expect(
          yield* Effect.flip(runner.runAction(ref, { count: Number.NaN })),
        ).toBeInstanceOf(Schema.SchemaError);
        expect(native).toHaveBeenCalledTimes(3);
      }).pipe(Effect.provide(ActionRunner.layer(native)));
    },
  );
});
