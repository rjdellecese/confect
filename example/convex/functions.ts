import { Schema } from "@effect/schema";
import { Effect } from "effect";
import * as schemas from "@rjdellecese/confect/schemas";
import {
	mutation,
	query,
} from "./confect";
import { confectTableSchemas } from "./schema";

export const getNote = query({
	args: Schema.Struct({
		noteId: schemas.Id.Id<"notes">(),
	}),
	returns: Schema.Option(confectTableSchemas.notes.withSystemFields),
	handler: ({ db }, { noteId }) => db.get(noteId),
});

export const insertNote = mutation({
	args: Schema.Struct({
		text: Schema.String,
	}),
	returns: schemas.Id.Id<"notes">(),
	handler: ({ db }, { text }) =>
		db.insert("notes", { text }).pipe(
			Effect.catchTag("ParseError", (e) => Effect.die(e)),
		),
});

export const listNotes = query({
	args: Schema.Struct({}),
	returns: Schema.Array(confectTableSchemas.notes.withSystemFields),
	handler: ({ db }) => db.query("notes").collect(),
});
