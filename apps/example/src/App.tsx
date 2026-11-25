import {
  PaginatedQueryResult,
  QueryResult,
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
  useStreamPaginatedQuery,
} from "@confect/react";
import type { WorkId } from "@convex-dev/workpool";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpApiClient from "effect/http-api/HttpApiClient";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { pipe } from "effect/Function";
import * as React from "react";
import { Id } from "../confect/_generated/id";
import refs from "../confect/_generated/refs";
import { Api } from "../confect/http/NotesApi";

const encodeJson = Schema.Unknown.pipe(
  Schema.fromJsonString,
  Schema.encodeResult,
);

const App = () => {
  const convexClient = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

  return (
    <ConvexProvider client={convexClient}>
      <Page />
    </ConvexProvider>
  );
};

const Page = () => {
  const [note, setNote] = React.useState("");
  const insertNote = useMutation(refs.public.notes_and_random.notes.insert);

  const [randomNumber, setRandomNumber] = React.useState<number | null>(null);
  const getRandom = useAction(refs.public.notes_and_random.random.getNumber);

  const retrieveRandomNumber = React.useCallback(() => {
    void getRandom({}).then((n) => setRandomNumber(n));
  }, [getRandom]);

  const [emailStatus, setEmailStatus] = React.useState<string | null>(null);
  const sendEmail = useAction(refs.public.email.send);

  const testEmail = () => {
    setEmailStatus("Sending…");
    void sendEmail({
      to: "test@example.com",
      subject: "Test email",
      body: "Test email body",
    })
      .then(() => setEmailStatus("Sent!"))
      .catch((error: unknown) => setEmailStatus(`Error: ${String(error)}`));
  };

  React.useEffect(retrieveRandomNumber, [retrieveRandomNumber]);

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
        Random number:{" "}
        {randomNumber !== null &&
        randomNumber !== 0 &&
        !Number.isNaN(randomNumber)
          ? randomNumber
          : "Loading…"}
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

      <ViewerDemo />

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
      <PaginatedNoteList />
      <StreamFeed />
      <NoteLookup />
      <HttpEndpoints />
    </div>
  );
};

const ViewerDemo = () => {
  const [username, setUsername] = React.useState("");
  const [viewerNote, setViewerNote] = React.useState("");
  const [postStatus, setPostStatus] = React.useState<string | null>(null);

  // `whoAmI` is covered by the `RequireViewer` middleware: it provides the
  // current viewer to the handler, or fails with the typed `NotSignedIn`
  // error—which surfaces here, decoded, in `onFailure`.
  const whoAmI = useQuery(refs.public.viewer.whoAmI, {});
  const createUser = useMutation(refs.public.users.create);
  const clearUsers = useMutation(refs.public.users.clearAll);
  const postNote = useMutation(refs.public.viewer.postNote);

  const handlePostNote = () => {
    void postNote({ text: viewerNote }).then((result) => {
      setPostStatus(
        Result.match(result, {
          onSuccess: () => "Posted!",
          onFailure: () => "Not signed in—create a user first.",
        }),
      );
      setViewerNote("");
      return null;
    });
  };

  return (
    <div>
      <strong>Middleware (viewer)</strong>
      <div>
        {QueryResult.match(whoAmI, {
          onLoading: () => "Loading…",
          onSuccess: (name) => `Signed in as ${name}`,
          onFailure: () => "Not signed in—create a user below.",
        })}
      </div>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="username"
      />
      <button
        type="button"
        onClick={() =>
          void createUser({ username }).then(() => setUsername(""))
        }
      >
        Create user
      </button>
      <button type="button" onClick={() => void clearUsers({})}>
        Clear users
      </button>
      <div>
        <input
          value={viewerNote}
          onChange={(e) => setViewerNote(e.target.value)}
          placeholder="note text"
        />
        <button type="button" onClick={handlePostNote}>
          Post note as viewer
        </button>
        {postStatus && <span style={{ marginLeft: 8 }}>{postStatus}</span>}
      </div>
    </div>
  );
};

const NoteId = Id("notes");

const NoteLookup = () => {
  const [input, setInput] = React.useState("");
  const [noteId, setNoteId] = React.useState<Id<"notes"> | undefined>();

  const lookup = useQuery(
    refs.public.notes_and_random.notes.getOrFail,
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
        onClick={() =>
          setNoteId(
            Schema.decodeUnknownResult(NoteId)(input).pipe(Result.getOrThrow),
          )
        }
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
  const [jobs, setJobs] = React.useState<Array<WorkId>>([]);
  const enqueue = useMutation(refs.public.workpool.enqueue);

  const handleEnqueue = () => {
    void enqueue({}).then((id) => setJobs((prev) => [...prev, id]));
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
            {pipe(
              jobs.slice(-10),
              Array.reverse,
              Array.map((workId, i) => (
                <WorkStatusRow
                  key={workId}
                  index={jobs.length - i}
                  workId={workId}
                />
              )),
            )}
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
  const notesResult = useQuery(refs.public.notes_and_random.notes.list, {});

  const deleteNote = useMutation(
    refs.public.notes_and_random.notes.delete_,
  ).withOptimisticUpdate((localStore, { noteId }) => {
    const current = localStore.getQuery(
      refs.public.notes_and_random.notes.list,
      {},
    );
    if (Option.isSome(current)) {
      localStore.setQuery(
        refs.public.notes_and_random.notes.list,
        {},
        Option.some(Array.filter(current.value, (note) => note._id !== noteId)),
      );
    }
  });

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

const PaginatedNoteList = () => {
  const paginatedNotes = usePaginatedQuery(
    refs.public.notes_and_random.notes.listPaginated,
    {},
    { initialNumItems: 3 },
  );

  return (
    <div>
      <h2>Paginated notes</h2>
      <ul>
        {Array.map(paginatedNotes.results, (note) => (
          <li key={note._id}>{note.text}</li>
        ))}
      </ul>
      {paginatedNotes.isLoading && <p>Loading…</p>}
      {PaginatedQueryResult.isCanLoadMore(paginatedNotes) && (
        <button type="button" onClick={() => paginatedNotes.loadMore(3)}>
          Load more
        </button>
      )}
      {PaginatedQueryResult.isExhausted(paginatedNotes) && (
        <p>All notes loaded.</p>
      )}
    </div>
  );
};

const StreamFeed = () => {
  const [text, setText] = React.useState("");
  const insertAuthored = useMutation(
    refs.public.notes_and_random.notes.insertAuthored,
  );

  const feed = useStreamPaginatedQuery(
    refs.public.notes_and_random.notes.feed,
    {},
    { initialNumItems: 3 },
  );

  const post = (role: "admin" | "user", hidden?: boolean) => {
    const args = {
      text: text === "" ? `Hello from ${role}` : text,
      role,
    };
    void insertAuthored(hidden === true ? { ...args, hidden } : args).then(() =>
      setText(""),
    );
  };

  return (
    <div>
      <h2>Stream feed</h2>
      <p style={{ maxWidth: 480, fontSize: "0.9em", color: "#666" }}>
        A <code>QueryStream.merge</code> of the admin- and user-authored note
        streams (two ranges of the <code>by_role</code> index), interleaved
        newest-first by creation time, filtered with <code>filterEffect</code>{" "}
        (hidden notes are skipped without breaking pagination), and paginated
        reactively with endCursor-pinned pages.
      </p>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="feed post text"
      />
      <button type="button" onClick={() => post("admin")}>
        Post as admin
      </button>
      <button type="button" onClick={() => post("user")}>
        Post as user
      </button>
      <button type="button" onClick={() => post("user", true)}>
        Post hidden
      </button>
      <ul>
        {Array.map(feed.results, (note) => (
          <li key={note._id}>
            <strong>{note.author?.name ?? "?"}</strong> ({note.author?.role}):{" "}
            {note.text}
          </li>
        ))}
      </ul>
      {feed.isLoading && <p>Loading…</p>}
      {PaginatedQueryResult.isCanLoadMore(feed) && (
        <button type="button" onClick={() => feed.loadMore(3)}>
          Load more
        </button>
      )}
      {PaginatedQueryResult.isExhausted(feed) && <p>End of feed.</p>}
    </div>
  );
};

const ApiClient = HttpApiClient.make(Api, {
  baseUrl: import.meta.env.VITE_CONVEX_SITE_URL,
});

const getFirst = ApiClient.pipe(
  Effect.andThen((client) => client.notes.getFirst()),
  Effect.scoped,
);

const HttpEndpoints = () => {
  const [getResponse, setGetResponse] = React.useState<Exit.Exit<
    Effect.Success<typeof getFirst>,
    Effect.Error<typeof getFirst>
  > | null>(null);

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          void getFirst
            .pipe(Effect.provide(FetchHttpClient.layer), Effect.runPromiseExit)
            .then((exit) => setGetResponse(exit))
        }
      >
        HTTP GET /path-prefix/get-first
      </button>
      <p>
        {getResponse !== null
          ? Exit.match(getResponse, {
              onSuccess: (value) => encodeJson(value).pipe(Result.getOrThrow),
              onFailure: (error) => encodeJson(error).pipe(Result.getOrThrow),
            })
          : "No response yet"}
      </p>
    </div>
  );
};

export default App;
