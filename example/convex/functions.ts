import { Schema } from "@effect/schema";
import { Id } from "@rjdellecese/confect/server";
import { Effect } from "effect";
import { mutation, query } from "./confect";
import { confectTableSchemas } from "./schema";

export const getNote = query({
	args: Schema.Struct({
		noteId: Id.Id<"notes">(),
	}),
	returns: Schema.Option(confectTableSchemas.notes.withSystemFields),
	handler: ({ db }, { noteId }) => db.get(noteId),
});

export const insertNote = mutation({
	args: Schema.Struct({
		text: Schema.String,
	}),
	returns: Id.Id<"notes">(),
	handler: ({ db }, { text }) =>
		db
			.insert("notes", { text })
			.pipe(Effect.catchTag("ParseError", (e) => Effect.die(e))),
});

export const listNotes = query({
	args: Schema.Struct({}),
	returns: Schema.Array(confectTableSchemas.notes.withSystemFields),
	handler: ({ db }) => db.query("notes").collect(),
});
