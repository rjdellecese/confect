import { assert, describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { Ref } from "@confect/core";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import refs from "./fixtures/confect/_generated/refs";
import {
  DatabaseReader,
  DatabaseWriter,
} from "./fixtures/confect/_generated/services";
import { NoNotes, NoViewer } from "./fixtures/confect/groups/middleware.spec";
import { GateClosed } from "./fixtures/confect/groups/middlewareOrder.spec";
import * as TestConfect from "./TestConfect";

const expectFailure = <A, E>(result: Result.Result<A, E>): E => {
  assert(Result.isFailure(result));
  return result.failure;
};

const insertUser = (username: string) =>
  Effect.gen(function* () {
    const c = yield* TestConfect.TestConfect;
    yield* c.run(
      Effect.gen(function* () {
        const writer = yield* DatabaseWriter;
        yield* writer.table("users").insert({ username });
      }),
    );
  }).pipe(Effect.orDie);

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
      }).pipe(Effect.provide(TestConfect.layer())),
    );

    it.effect("provides a service to a mutation handler", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        yield* insertUser("grace");

        const name = yield* c.mutation(
          refs.public.groups.middleware.viewerNameMutation,
        );

        expect(name).toBe("grace");
      }).pipe(Effect.provide(TestConfect.layer())),
    );

    it.effect(
      "provides a service to an action handler via the per-kind QueryRunner strategy",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          yield* insertUser("alan");

          const name = yield* c.action(
            refs.public.groups.middleware.viewerNameAction,
          );

          expect(name).toBe("alan");
        }).pipe(Effect.provide(TestConfect.layer())),
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
        }).pipe(Effect.provide(TestConfect.layer())),
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
        }).pipe(Effect.provide(TestConfect.layer())),
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
        }).pipe(Effect.provide(TestConfect.layer())),
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

  describe("ordering and short-circuiting", () => {
    it.effect("middleware run in attachment order, before the handler", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        yield* c.mutation(refs.public.groups.middlewareOrder.record, {
          blocked: false,
        });

        const texts = yield* listNoteTexts;
        expect(texts).toStrictEqual(["first", "second", "handler"]);
      }).pipe(Effect.provide(TestConfect.layer())),
    );

    it.effect(
      "an outer middleware's short-circuit skips inner middleware and the handler",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;

          const result = yield* Effect.result(
            c.mutation(refs.public.groups.middlewareOrder.record, {
              blocked: true,
            }),
          );

          const error = expectFailure(result);
          expect(error).toBeInstanceOf(GateClosed);
          expect((error as GateClosed).reason).toBe("blocked by gate");

          const texts = yield* listNoteTexts;
          expect(texts).toStrictEqual([]);
        }).pipe(Effect.provide(TestConfect.layer())),
    );
  });
});
