import { Schema } from "@effect/schema";
import { Id } from "@rjdellecese/confect/server";
import { confectSchema } from "./schema";

export const ListNotesArgs = Schema.Struct({});
export const ListNotesResult = Schema.Array(
	confectSchema.tableSchemas.notes.withSystemFields,
);

export const InsertNoteArgs = Schema.Struct({
	text: Schema.String,
});
export const InsertNoteResult = Id.Id<"notes">();

export const DeleteNoteArgs = Schema.Struct({
	noteId: Id.Id<"notes">(),
});
export const DeleteNoteResult = Schema.Null;

export const GetRandomArgs = Schema.Struct({});
export const GetRandomResult = Schema.Number;

export const GetFirstArgs = Schema.Struct({});
export const GetFirstResult = Schema.Option(
	confectSchema.tableSchemas.notes.withSystemFields,
);
