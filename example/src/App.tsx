import { useAction, useMutation, useQuery } from "@rjdellecese/confect/react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Array, Effect, Exit, Option } from "effect";
import { useEffect, useState } from "react";
import { api } from "../convex/_generated/api";
import {
	DeleteNoteArgs,
	DeleteNoteResult,
	GetRandomArgs,
	GetRandomResult,
	InsertNoteArgs,
	InsertNoteResult,
	ListNotesArgs,
	ListNotesResult,
} from "../convex/functions.schemas";
import { FetchHttpClient, HttpApiClient } from "@effect/platform";
import { Api } from "../convex/http/api";

const App = () => {
	const convexClient = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

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
		args: InsertNoteArgs,
		returns: InsertNoteResult,
	});

	const [randomNumber, setRandomNumber] = useState<number | null>(null);
	const getRandom = useAction({
		action: api.functions.getRandom,
		args: GetRandomArgs,
		returns: GetRandomResult,
	});

	const retrieveRandomNumber = () => {
		getRandom({}).pipe(Effect.map(setRandomNumber), Effect.runPromise);
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: Initial render only
	useEffect(() => {
		retrieveRandomNumber();
	}, []);

	return (
		<div>
			<h1>Confect Example</h1>

			<div>
				Random number: {randomNumber ? randomNumber : "Loading…"}
				<br />
				<button type="button" onClick={retrieveRandomNumber}>
					Get new random number
				</button>
			</div>

			<br />

			<textarea
				rows={4}
				cols={50}
				value={note}
				onChange={(e) => setNote(e.target.value)}
			/>
			<br />
			<button
				type="button"
				onClick={() =>
					insertNote({ text: note }).pipe(
						Effect.andThen(() => setNote("")),
						Effect.runPromise,
					)
				}
			>
				Insert note
			</button>

			<NoteList />
			<HttpEndpoints />
		</div>
	);
};

const NoteList = () => {
	const notes = useQuery({
		query: api.functions.listNotes,
		args: ListNotesArgs,
		returns: ListNotesResult,
	})({});

	const deleteNote = useMutation({
		mutation: api.functions.deleteNote,
		args: DeleteNoteArgs,
		returns: DeleteNoteResult,
	});

	return Option.match(notes, {
		onNone: () => <p>Loading…</p>,
		onSome: (notes) => (
			<ul>
				{Array.map(notes, (note) => (
					<li key={note._id}>
						<p>{note.text}</p>
						<button
							type="button"
							onClick={() =>
								deleteNote({ noteId: note._id }).pipe(Effect.runPromise)
							}
						>
							Delete note
						</button>
					</li>
				))}
			</ul>
		),
	});
};

const ApiClient = HttpApiClient.make(Api, {
	baseUrl: import.meta.env.VITE_CONVEX_URL.replace(
		"convex.cloud",
		"convex.site",
	),
});

const getFirst = ApiClient.pipe(
	Effect.andThen((client) => client.group.getFirst()),
	Effect.scoped,
	Effect.provide(FetchHttpClient.layer),
);

const HttpEndpoints = () => {
	const [getResponse, setGetResponse] = useState<Exit.Exit<any, any> | null>(
		null,
	);

	return (
		<div>
			<button
				type="button"
				onClick={() =>
					getFirst
						.pipe(Effect.runPromiseExit)
						.then((exit) => setGetResponse(exit))
				}
			>
				Get
			</button>
			<p>
				{getResponse
					? Exit.match(getResponse, {
							onSuccess: (value) => String(value),
							onFailure: (error) => String(error),
						})
					: "No response yet"}
			</p>
		</div>
	);
};

export default App;
