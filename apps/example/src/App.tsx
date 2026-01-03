import { FetchHttpClient, HttpApiClient } from "@effect/platform";
import { useAction, useMutation, useQuery } from "@confect/react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Array, Effect, Exit, Option } from "effect";
import { useEffect, useState } from "react";
import { api } from "../confect/_generated/refs";
import { Api } from "../confect/http/path-prefix";

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
  const insertNote = useMutation(api.groups.notes.insert);

  const [randomNumber, setRandomNumber] = useState<number | null>(null);
  const getRandom = useAction(api.groups.random.getNumber);

  const retrieveRandomNumber = () => {
    getRandom({}).pipe(Effect.map(setRandomNumber), Effect.runPromise);
  };

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
  const notes = useQuery(api.groups.notes.list, {});

  const deleteNote = useMutation(api.groups.notes.delete_);

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
  Effect.andThen((client) => client.notes.getFirst()),
  Effect.scoped,
  Effect.provide(FetchHttpClient.layer),
);

const HttpEndpoints = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        HTTP GET /path-prefix/get-first
      </button>
      <p>
        {getResponse
          ? Exit.match(getResponse, {
              onSuccess: (value) => JSON.stringify(value),
              onFailure: (error) => JSON.stringify(error),
            })
          : "No response yet"}
      </p>
    </div>
  );
};

export default App;
