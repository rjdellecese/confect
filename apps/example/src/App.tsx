import { QueryResult, useAction, useMutation, useQuery } from "@confect/react";
import type { WorkId } from "@convex-dev/workpool";
import { FetchHttpClient, HttpApiClient } from "@effect/platform";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { GenericId } from "convex/values";
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
    void getRandom({}).then((n) => {
      setRandomNumber(n);
    });
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
        {QueryResult.match(envVar, {
          onLoading: () => "Loading…",
          onSuccess: (value) => value,
        })}
      </div>

      <br />

      <WorkpoolDemo />

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
      <NoteLookup />
      <HttpEndpoints />
    </div>
  );
};

const NoteLookup = () => {
  const [input, setInput] = useState("");
  const [noteId, setNoteId] = useState<GenericId<"notes"> | undefined>();

  const lookup = useQuery(
    refs.public.notesAndRandom.notes.getOrFail,
    noteId === undefined ? "skip" : { noteId },
  );

  return (
    <div>
      <h2>Look up a note by id</h2>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="note id"
        style={{ fontFamily: "monospace" }}
      />
      <button
        type="button"
        onClick={() => setNoteId(input as GenericId<"notes">)}
      >
        Look up
      </button>
      <div>
        {noteId === undefined
          ? "Enter a note id and click Look up."
          : QueryResult.match(lookup, {
              onLoading: () => "Looking up…",
              onSuccess: (note) => `Found note: "${note.text}"`,
              onFailure: (error) => `Note ${error.noteId} not found.`,
            })}
      </div>
    </div>
  );
};

const WorkpoolDemo = () => {
  const [jobs, setJobs] = useState<Array<{ id: WorkId; enqueuedAt: number }>>(
    [],
  );
  const enqueue = useMutation(refs.public.workpool.enqueue);

  const handleEnqueue = () => {
    void enqueue({}).then((id) => {
      setJobs((prev) => [...prev, { id, enqueuedAt: Date.now() }]);
    });
  };

  return (
    <div>
      <strong>Workpool (plain Convex component)</strong>
      <br />
      <button type="button" onClick={handleEnqueue}>
        Enqueue background work
      </button>
      {jobs.length > 0 && (
        <table style={{ marginTop: 8, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", paddingRight: 16 }}>Job</th>
              <th style={{ textAlign: "left" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {jobs
              .slice(-10)
              .toReversed()
              .map((job, i) => (
                <WorkStatusRow
                  key={job.id}
                  index={jobs.length - i}
                  workId={job.id}
                />
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

const statusLabel = (status: {
  state: string;
  previousAttempts?: number;
}): string => {
  switch (status.state) {
    case "pending":
      return `⏳ Pending (attempts: ${status.previousAttempts})`;
    case "running":
      return `🔄 Running (attempts: ${status.previousAttempts})`;
    case "finished":
      return "✅ Finished";
    default:
      return status.state;
  }
};

const WorkStatusRow = ({
  index,
  workId,
}: {
  index: number;
  workId: WorkId;
}) => {
  const status = useQuery(refs.public.workpool.status, { workId });

  return (
    <tr>
      <td style={{ paddingRight: 16, fontFamily: "monospace" }}>#{index}</td>
      <td>
        {QueryResult.match(status, {
          onLoading: () => "Loading…",
          onSuccess: (value) => statusLabel(value),
        })}
      </td>
    </tr>
  );
};

const NoteList = () => {
  const notesResult = useQuery(refs.public.notesAndRandom.notes.list, {});

  const deleteNote = useMutation(refs.public.notesAndRandom.notes.delete_);

  return QueryResult.match(notesResult, {
    onLoading: () => <p>Loading…</p>,
    onSuccess: (notes) => (
      <ul>
        {Array.map(notes, (note) => (
          <li key={note._id}>
            <p>{note.text}</p>
            <p
              style={{
                fontFamily: "monospace",
                fontSize: "0.85em",
                color: "#666",
              }}
            >
              id: {note._id}
            </p>
            <button
              type="button"
              onClick={() => void deleteNote({ noteId: note._id })}
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
  baseUrl: import.meta.env.VITE_CONVEX_SITE_URL,
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
