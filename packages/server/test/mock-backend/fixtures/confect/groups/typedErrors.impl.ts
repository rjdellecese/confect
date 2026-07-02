import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import databaseSchema from "../_generated/schema";
import refs from "../_generated/refs";
import {
  ActionRunner,
  DatabaseReader,
  DatabaseWriter,
  MutationRunner,
  QueryRunner,
} from "../_generated/services";
import typedErrors from "./typedErrors.spec";
import { Forbidden, NotFound } from "./typedErrors.spec";

const getNoteOrFail = FunctionImpl.make(
  databaseSchema,
  typedErrors,
  "getNoteOrFail",
  ({ noteId }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      return yield* reader
        .table("notes")
        .get(noteId)
        .pipe(Effect.mapError(() => new NotFound({ id: noteId })));
    }),
);

const deleteNoteOrFail = FunctionImpl.make(
  databaseSchema,
  typedErrors,
  "deleteNoteOrFail",
  ({ noteId, asAdmin }) =>
    Effect.gen(function* () {
      if (!asAdmin) {
        return yield* new Forbidden({ reason: "admin required" });
      }

      const reader = yield* DatabaseReader;
      const writer = yield* DatabaseWriter;

      yield* reader
        .table("notes")
        .get(noteId)
        .pipe(Effect.mapError(() => new NotFound({ id: noteId })));

      yield* writer.table("notes").delete(noteId);

      return null;
    }),
);

const failingAction = FunctionImpl.make(
  databaseSchema,
  typedErrors,
  "failingAction",
  ({ kind }) =>
    Match.value(kind).pipe(
      Match.when("notFound", () =>
        Effect.fail(new NotFound({ id: "missing" })),
      ),
      Match.when("forbidden", () =>
        Effect.fail(new Forbidden({ reason: "no access" })),
      ),
      Match.exhaustive,
    ),
);

const insertThenFail = FunctionImpl.make(
  databaseSchema,
  typedErrors,
  "insertThenFail",
  ({ text }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      yield* writer.table("notes").insert({ text }).pipe(Effect.orDie);

      return yield* new NotFound({ id: "rolled-back" });
    }),
);

const tryGetNote = FunctionImpl.make(
  databaseSchema,
  typedErrors,
  "tryGetNote",
  ({ noteId }) =>
    Effect.gen(function* () {
      const runQuery = yield* QueryRunner;

      const note = yield* runQuery(
        refs.public.groups.typedErrors.getNoteOrFail,
        { noteId },
      );

      return { _tag: "Ok" as const, text: note.text };
    }).pipe(
      Effect.catchTag("NotFound", (notFound: NotFound) =>
        Effect.succeed({ _tag: "NotFound" as const, id: notFound.id }),
      ),
      Effect.orDie,
    ),
);

const tryDeleteNote = FunctionImpl.make(
  databaseSchema,
  typedErrors,
  "tryDeleteNote",
  ({ noteId, asAdmin }) =>
    Effect.gen(function* () {
      const runMutation = yield* MutationRunner;

      yield* runMutation(refs.public.groups.typedErrors.deleteNoteOrFail, {
        noteId,
        asAdmin,
      });

      return { _tag: "Ok" as const };
    }).pipe(
      Effect.catchTags({
        NotFound: (notFound: NotFound) =>
          Effect.succeed({ _tag: "NotFound" as const, id: notFound.id }),
        Forbidden: (forbidden: Forbidden) =>
          Effect.succeed({
            _tag: "Forbidden" as const,
            reason: forbidden.reason,
          }),
      }),
      Effect.orDie,
    ),
);

const tryFailingAction = FunctionImpl.make(
  databaseSchema,
  typedErrors,
  "tryFailingAction",
  ({ kind }) =>
    Effect.gen(function* () {
      const runAction = yield* ActionRunner;

      yield* runAction(refs.public.groups.typedErrors.failingAction, { kind });

      return yield* Effect.die(
        new Error("failingAction was expected to fail with a typed error"),
      );
    }).pipe(
      Effect.catchTags({
        NotFound: (notFound: NotFound) =>
          Effect.succeed({ _tag: "NotFound" as const, id: notFound.id }),
        Forbidden: (forbidden: Forbidden) =>
          Effect.succeed({
            _tag: "Forbidden" as const,
            reason: forbidden.reason,
          }),
      }),
      Effect.orDie,
    ),
);

const internalGetNoteOrFail = FunctionImpl.make(
  databaseSchema,
  typedErrors,
  "internalGetNoteOrFail",
  ({ noteId }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      return yield* reader
        .table("notes")
        .get(noteId)
        .pipe(Effect.mapError(() => new NotFound({ id: noteId })));
    }),
);

const tryInternalGetNote = FunctionImpl.make(
  databaseSchema,
  typedErrors,
  "tryInternalGetNote",
  ({ noteId }) =>
    Effect.gen(function* () {
      const runQuery = yield* QueryRunner;

      const note = yield* runQuery(
        refs.internal.groups.typedErrors.internalGetNoteOrFail,
        { noteId },
      );

      return { _tag: "Ok" as const, text: note.text };
    }).pipe(
      Effect.catchTag("NotFound", (notFound: NotFound) =>
        Effect.succeed({ _tag: "NotFound" as const, id: notFound.id }),
      ),
      Effect.orDie,
    ),
);

export default GroupImpl.make(databaseSchema, typedErrors).pipe(
  Layer.provide(getNoteOrFail),
  Layer.provide(deleteNoteOrFail),
  Layer.provide(failingAction),
  Layer.provide(insertThenFail),
  Layer.provide(tryGetNote),
  Layer.provide(tryDeleteNote),
  Layer.provide(tryFailingAction),
  Layer.provide(internalGetNoteOrFail),
  Layer.provide(tryInternalGetNote),
  GroupImpl.finalize,
);
