import { Effect } from "effect";
import { action, mutation, query } from "./confect";
import {
	DeleteNoteArgs,
	DeleteNoteResult,
	GetFirstArgs,
	GetFirstResult,
	GetRandomArgs,
	GetRandomResult,
	InsertNoteArgs,
	InsertNoteResult,
	ListNotesArgs,
	ListNotesResult,
} from "./functions.schemas";

export const insertNote = mutation({
	args: InsertNoteArgs,
	returns: InsertNoteResult,
	handler: ({ db }, { text }) =>
		db
			.insert("notes", { text })
			.pipe(Effect.catchTag("ParseError", (e) => Effect.die(e))),
});

export const listNotes = query({
	args: ListNotesArgs,
	returns: ListNotesResult,
	handler: ({ db }) => db.query("notes").order("desc").collect(),
});

export const deleteNote = mutation({
	args: DeleteNoteArgs,
	returns: DeleteNoteResult,
	handler: ({ db }, { noteId }) => db.delete(noteId).pipe(Effect.as(null)),
});

export const getRandom = action({
	args: GetRandomArgs,
	returns: GetRandomResult,
	handler: () => Effect.succeed(Math.random()),
});

export const getFirst = query({
	args: GetFirstArgs,
	returns: GetFirstResult,
	handler: ({ db }) => db.query("notes").first(),
});
