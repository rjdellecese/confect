import { expect, expectTypeOf, it } from "@effect/vitest";
import type { Ref } from "@confect/core";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import refs from "./fixtures/confect/_generated/refs";
import { DatabaseWriter } from "./fixtures/confect/_generated/services";
import { NameRejected } from "./fixtures/confect/middleware/RequireName.spec";
import type { NoViewer } from "./fixtures/confect/middleware/ProvideViewer.spec";
import * as TestConfect from "./TestConfect";

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
      expect(group.shortName.middlewareOptions.RequireName).toEqual({
        minLength: 2,
      });
      expect(group.longName.middlewareOptions.RequireName).toEqual({
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
