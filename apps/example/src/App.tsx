import { useAction, useMutation, useQuery } from "@confect/react";
import { FetchHttpClient, HttpApiClient } from "@effect/platform";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Array, Effect, Exit } from "effect";
import { useEffect, useState } from "react";
import refs from "../confect/_generated/refs";
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
  const insertNote = useMutation(refs.public.notesAndRandom.notes.insert);

  const [randomNumber, setRandomNumber] = useState<number | null>(null);
  const getRandom = useAction(refs.public.notesAndRandom.random.getNumber);

  const retrieveRandomNumber = () => {
    void getRandom({}).then(setRandomNumber);
  };

  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const sendEmail = useAction(refs.public.node.email.send);

  const testEmail = () => {
    setEmailStatus("Sending…");
    void sendEmail({
      to: "test@example.com",
      subject: "Test email",
      body: "Test email body",
    })
      .then(() => setEmailStatus("Sent!"))
      .catch((error) => setEmailStatus(`Error: ${String(error)}`));
  };

  useEffect(() => {
    retrieveRandomNumber();
  }, []);

  const envVar = useQuery(refs.public.env.readEnvVar, {});

  return (
    <div>
      <h1>Confect Example</h1>

      <div>
        <span style={{ fontFamily: "monospace" }}>TEST_ENV_VAR: </span>
        {envVar === undefined ? "Loading…" : envVar}
      </div>

      <br />

      <NoteCount />

      <br />

      <div>
        Random number: {randomNumber ? randomNumber : "Loading…"}
        <br />
        <button type="button" onClick={retrieveRandomNumber}>
          Get new random number
        </button>
      </div>

      <br />

      <div>
        <button type="button" onClick={testEmail}>
          Test email send
        </button>
        {emailStatus && <span style={{ marginLeft: 8 }}>{emailStatus}</span>}
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
        onClick={() => void insertNote({ text: note }).then(() => setNote(""))}
      >
        Insert note
      </button>

      <NoteList />
      <HttpEndpoints />
    </div>
  );
};

const NoteCount = () => {
  const noteCount = useQuery(refs.public.native.noteCount, {});

  return (
    <div>
      Note count (native Convex query):{" "}
      {noteCount === undefined ? "Loading…" : noteCount}
    </div>
  );
};

const NoteList = () => {
  const notes = useQuery(refs.public.notesAndRandom.notes.list, {});

  const deleteNote = useMutation(refs.public.notesAndRandom.notes.delete_);

  if (notes === undefined) {
    return <p>Loading…</p>;
  }

  return (
    <ul>
      {Array.map(notes, (note) => (
        <li key={note._id}>
          <p>{note.text}</p>
          <button
            type="button"
            onClick={() => void deleteNote({ noteId: note._id })}
          >
            Delete note
          </button>
        </li>
      ))}
    </ul>
  );
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
