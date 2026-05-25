import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer, Match } from "effect";
import api from "../_generated/api";
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
  api,
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
  api,
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
  api,
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
  api,
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
  api,
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
  api,
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
  api,
  typedErrors,
  "tryFailingAction",
  ({ kind }) =>
    Effect.gen(function* () {
      const runAction = yield* ActionRunner;

      yield* runAction(refs.public.groups.typedErrors.failingAction, { kind });

      return yield* Effect.dieMessage(
        "failingAction was expected to fail with a typed error",
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
  api,
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
  api,
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

export default GroupImpl.make(api, typedErrors).pipe(
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
