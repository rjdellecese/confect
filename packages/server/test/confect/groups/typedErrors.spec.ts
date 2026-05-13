import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
import { Schema } from "effect";
import { Notes } from "../tables/Notes";

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  id: Schema.String,
}) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {
  reason: Schema.String,
}) {}

const NoteError = Schema.Union(NotFound, Forbidden);

const TryGetResult = Schema.Union(
  Schema.TaggedStruct("Ok", { text: Schema.String }),
  Schema.TaggedStruct("NotFound", { id: Schema.String }),
);

const TryDeleteResult = Schema.Union(
  Schema.TaggedStruct("Ok", {}),
  Schema.TaggedStruct("NotFound", { id: Schema.String }),
  Schema.TaggedStruct("Forbidden", { reason: Schema.String }),
);

const TryFailingActionResult = Schema.Union(
  Schema.TaggedStruct("NotFound", { id: Schema.String }),
  Schema.TaggedStruct("Forbidden", { reason: Schema.String }),
);

export const typedErrors = GroupSpec.make("typedErrors")
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getNoteOrFail",
      args: Schema.Struct({ noteId: GenericId.GenericId("notes") }),
      returns: Notes.Doc,
      error: NotFound,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "deleteNoteOrFail",
      args: Schema.Struct({
        noteId: GenericId.GenericId("notes"),
        asAdmin: Schema.Boolean,
      }),
      returns: Schema.Null,
      error: NoteError,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "failingAction",
      args: Schema.Struct({
        kind: Schema.Literal("notFound", "forbidden"),
      }),
      returns: Schema.Null,
      error: NoteError,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "insertThenFail",
      args: Schema.Struct({ text: Schema.String }),
      returns: Schema.Null,
      error: NotFound,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "tryGetNote",
      args: Schema.Struct({ noteId: GenericId.GenericId("notes") }),
      returns: TryGetResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "tryDeleteNote",
      args: Schema.Struct({
        noteId: GenericId.GenericId("notes"),
        asAdmin: Schema.Boolean,
      }),
      returns: TryDeleteResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "tryFailingAction",
      args: Schema.Struct({
        kind: Schema.Literal("notFound", "forbidden"),
      }),
      returns: TryFailingActionResult,
    }),
  )
  .addFunction(
    FunctionSpec.internalQuery({
      name: "internalGetNoteOrFail",
      args: Schema.Struct({ noteId: GenericId.GenericId("notes") }),
      returns: Notes.Doc,
      error: NotFound,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "tryInternalGetNote",
      args: Schema.Struct({ noteId: GenericId.GenericId("notes") }),
      returns: TryGetResult,
    }),
  );
