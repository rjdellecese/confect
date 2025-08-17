import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { useAction, useMutation } from "@rjdellecese/confect/react";
import { ConfectProvider, useAtomSetConfect, useAtomSetConfectAction, useAtomValueConfect } from "@rjdellecese/confect/react/effect-atom";
import { Effect } from "effect";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { atomRuntime } from "./runtime";
import { getFirstTodoAtom } from "./atoms/notes";


export const EffectAtomPage = () => {
  return (
    <ConfectProvider atomRuntime={atomRuntime}>
      <Page />
    </ConfectProvider>
  );
};

const Page = () => {
  const [note, setNote] = useState("");
  const insertNote = useAtomSetConfect(api, 'functions', 'insertNote');

  const [randomNumber, setRandomNumber] = useState<number | null>(null);
  const getRandom = useAtomSetConfectAction(api, 'functions', 'getRandom');

  const retrieveRandomNumber = () => {
    getRandom({}).then(setRandomNumber)
  };

  useEffect(() => {
    retrieveRandomNumber();
  }, []);

  return (
    <div>
      <h1>Confect Example using Effect Atom integration</h1>

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
        onClick={() => insertNote({ text: note }).then(() => setNote(""))}
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
  
  const listNotes = useAtomValueConfect(api, 'functions', 'listNotes', {});

  const deleteNote = useAtomSetConfect(api, 'functions', 'deleteNote')

  return Result.builder(listNotes)
    .onInitial((initial) => Result.isInitial(initial) && <div>Loading...</div>)
    .onSuccess((result) => {
      // Success case - result is the todos array
      const todos = result
      return (
        <ul>
          {todos.map(todo => <li key={todo._id}>
            {todo.text}
            <button
              type="button"
              onClick={() => deleteNote({ noteId: todo['_id'] })}
            >
              Delete note
            </button>
            </li>)}
        </ul>
      )
    })
    .onError((error) => <div>Error: {error.message}</div>)
    .render()
};

const HttpEndpoints = () => {
  const firstNoteResult = useAtomValue(getFirstTodoAtom)
  const handleGetFirstNote = useAtomSet(getFirstTodoAtom, { mode: 'promise' })

  return (
    <div>
      <button
        type="button"
        onClick={() => handleGetFirstNote(void 0)}
      >
        HTTP GET /path-prefix/get-first
      </button>
      <p>
        {Result.builder(firstNoteResult)
        .onInitial(() => <p>Initial state (not waiting)</p>)
        .onFailure(() => <p>Failed to load first note</p>)
        .onDefect(() => <p>Failed to load first note defect</p>)
        .onWaiting(() => <p>Loading...</p>)
        .onSuccess((data) => <p>{JSON.stringify(data) ?? 'No notes found'}</p>)
        .render()}
      </p>
    </div>
  );
};