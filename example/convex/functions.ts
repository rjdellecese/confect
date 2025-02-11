import { Effect } from "effect";
import {
	action,
	ConfectMutationCtx,
	ConfectQueryCtx,
	mutation,
	query,
} from "./confect";
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
	handler: ({ text }) =>
		Effect.gen(function* () {
			const { db } = yield* ConfectMutationCtx;

			return yield* db
				.insert("notes", { text })
				.pipe(Effect.catchTag("ParseError", (e) => Effect.die(e)));
		}),
});

export const listNotes = query({
	args: ListNotesArgs,
	returns: ListNotesResult,
	handler: () =>
		Effect.gen(function* () {
			const { db } = yield* ConfectQueryCtx;

			return yield* db.query("notes").order("desc").collect();
		}),
});

export const deleteNote = mutation({
	args: DeleteNoteArgs,
	returns: DeleteNoteResult,
	handler: ({ noteId }) =>
		Effect.gen(function* () {
			const { db } = yield* ConfectMutationCtx;

			return yield* db.delete(noteId).pipe(Effect.as(null));
		}),
});

export const getRandom = action({
	args: GetRandomArgs,
	returns: GetRandomResult,
	handler: () => Effect.succeed(Math.random()),
});

export const getFirst = query({
	args: GetFirstArgs,
	returns: GetFirstResult,
	handler: () =>
		Effect.gen(function* () {
			const { db } = yield* ConfectQueryCtx;

			return yield* db.query("notes").first();
		}),
});
