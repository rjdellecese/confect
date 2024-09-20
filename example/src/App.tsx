/// <reference types="vite/client" />

import { useQuery, useMutation } from "@rjdellecese/confect/react";
import { api } from "../convex/_generated/api";
import { confectTableSchemas } from "../convex/schema";
import { Schema } from "@effect/schema";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Array, Effect, Option } from "effect";
import { useState } from "react";
import { Id } from "@rjdellecese/confect/server";

const App = () => {
	const convexClient = new ConvexReactClient(
		// biome-ignore lint/complexity/useLiteralKeys: TS error otherwise
		import.meta.env["VITE_CONVEX_URL"],
	);

	return (
		<ConvexProvider client={convexClient}>
			<Page />
		</ConvexProvider>
	);
};

const Page = () => {
	const [note, setNote] = useState("");
	const insertNote = useMutation({
		mutation: api.functions.insertNote,
		args: Schema.Struct({ text: Schema.String }),
		returns: Id.Id<"notes">(),
	});

	return (
		<div>
			<h1>Confect Example</h1>

			<textarea value={note} onChange={(e) => setNote(e.target.value)} />
			<button
				type="button"
				onClick={() => insertNote({ text: note }).pipe(Effect.runPromise)}
			>
				Insert
			</button>

			<NoteList />
		</div>
	);
};

const NoteList = () => {
	const notes = useQuery({
		query: api.functions.listNotes,
		args: Schema.Struct({}),
		returns: Schema.Array(confectTableSchemas.notes.withSystemFields),
	})({});

	return (
		<ul>
			{Option.match(notes, {
				onNone: () => <li>Loading…</li>,
				onSome: (notes) =>
					Array.map(notes, (note) => <li key={note._id}>{note.text}</li>),
			})}
		</ul>
	);
};

export default App;
