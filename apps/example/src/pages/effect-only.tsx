import { FetchHttpClient, HttpApiClient } from "@effect/platform";
import { useAction, useMutation, useQueryOption } from "@rjdellecese/confect/react/effect";
import { Effect, Exit, Option } from "effect";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { Api } from "../../convex/http/api";



export const EffectOnlyPage = () => {
  const [note, setNote] = useState("");
  const insertNote = useMutation(api, 'functions', 'insertNote');

  const [randomNumber, setRandomNumber] = useState<number | null>(null);
  const getRandom = useAction(api, 'functions', 'getRandom');

  const retrieveRandomNumber = () => {
    getRandom({}).pipe(Effect.map(setRandomNumber), Effect.runPromise);
  };

  useEffect(() => {
    retrieveRandomNumber();
  }, []);

  return (
    <div>
      <h1>Confect Example using Only Effect</h1>

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
  // new api - less verbose and less boilerplate
  
  const listNotes = useQueryOption(api, 'functions', 'listNotes')({});

  const deleteNote = useMutation(api, "functions", "deleteNote");
  const notes = Option.getOrNull(listNotes);
  console.log(notes)
  return Option.match(listNotes, {
    onNone: () => <div>Loading...</div>,
    onSome: (result) => {
      // Check if result is an error (has _tag property)
      if (result && typeof result === 'object' && '_tag' in result) {
        return <div>Error ({result._tag}): {result['message']}</div>
      }

      // Success case - result is the todos array
      const todos = result
      return (
        <ul>
          {todos.map(todo => <li key={todo._id}>
            {todo.text}
            <button
              type="button"
              onClick={() =>
                deleteNote({ noteId: todo['_id'] }).pipe(Effect.runPromise)
              }
            >
              Delete note
            </button>
            </li>)}
        </ul>
      )
    }
  })
};

const ApiClient = HttpApiClient.make(Api, {
  baseUrl: import.meta.env.VITE_CONVEX_URL.includes("convex.cloud") ? import.meta.env.VITE_CONVEX_URL.replace(
    "convex.cloud",
    "convex.site",
  ) : import.meta.env.VITE_CONVEX_API_URL,
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