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
          // that), but a failed mutation rolls back its whole transaction —
          // the markers they inserted are rolled back along with it.
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
});
