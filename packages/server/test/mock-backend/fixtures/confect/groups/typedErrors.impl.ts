import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import { FunctionImpl, GroupImpl } from "../_generated/server";
import notesTable from "../_generated/tables/notes";
import refs from "../_generated/refs";
import {
  ActionRunner,
  DatabaseReader,
  DatabaseWriter,
  MutationRunner,
  QueryRunner,
} from "../_generated/services";
import typedErrorsSpec from "./typedErrors.spec";
import { Forbidden, NotFound } from "./typedErrors.spec";

const getNoteOrFail = FunctionImpl.make(
  typedErrorsSpec,
  "getNoteOrFail",
  ({ noteId }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      return yield* reader
        .table(notesTable)
        .get(noteId)
        .pipe(Effect.mapError(() => NotFound.make({ id: noteId })));
    }),
);

const deleteNoteOrFail = FunctionImpl.make(
  typedErrorsSpec,
  "deleteNoteOrFail",
  ({ noteId, asAdmin }) =>
    Effect.gen(function* () {
      if (!asAdmin) {
        return yield* Forbidden.make({ reason: "admin required" });
      }

      const reader = yield* DatabaseReader;
      const writer = yield* DatabaseWriter;

      yield* reader
        .table(notesTable)
        .get(noteId)
        .pipe(Effect.mapError(() => NotFound.make({ id: noteId })));

      yield* writer.table(notesTable).delete(noteId);

      return null;
    }),
);

const failingAction = FunctionImpl.make(
  typedErrorsSpec,
  "failingAction",
  ({ kind }) =>
    Match.value(kind).pipe(
      Match.when("notFound", () =>
        Effect.fail(NotFound.make({ id: "missing" })),
      ),
      Match.when("forbidden", () =>
        Effect.fail(Forbidden.make({ reason: "no access" })),
      ),
      Match.exhaustive,
    ),
);

const insertThenFail = FunctionImpl.make(
  typedErrorsSpec,
  "insertThenFail",
  ({ text }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      yield* writer.table(notesTable).insert({ text }).pipe(Effect.orDie);

      return yield* NotFound.make({ id: "rolled-back" });
    }),
);

const tryGetNote = FunctionImpl.make(
  typedErrorsSpec,
  "tryGetNote",
  ({ noteId }) =>
    Effect.gen(function* () {
      const { runQuery } = yield* QueryRunner;

      const note = yield* runQuery(
        refs.public.groups.typedErrors.getNoteOrFail,
        {
          noteId,
        },
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
  typedErrorsSpec,
  "tryDeleteNote",
  ({ noteId, asAdmin }) =>
    Effect.gen(function* () {
      const { runMutation } = yield* MutationRunner;

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
  typedErrorsSpec,
  "tryFailingAction",
  ({ kind }) =>
    Effect.gen(function* () {
      const { runAction } = yield* ActionRunner;

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
  typedErrorsSpec,
  "internalGetNoteOrFail",
  ({ noteId }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      return yield* reader
        .table(notesTable)
        .get(noteId)
        .pipe(Effect.mapError(() => NotFound.make({ id: noteId })));
    }),
);

const tryInternalGetNote = FunctionImpl.make(
  typedErrorsSpec,
  "tryInternalGetNote",
  ({ noteId }) =>
    Effect.gen(function* () {
      const { runQuery } = yield* QueryRunner;

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

export default GroupImpl.make(typedErrorsSpec).pipe(
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
