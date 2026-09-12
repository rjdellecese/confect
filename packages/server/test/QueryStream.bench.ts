import * as QueryStreamKeyLayout from "@confect/server/QueryStreamKeyLayout";
import { bench } from "confect-bench-harness";
import * as QueryStream from "@confect/server/QueryStream";

interface Note {
  readonly _id: string;
  readonly _creationTime: number;
  readonly text: string;
  readonly tag?: string;
}

interface Message {
  readonly _id: string;
  readonly _creationTime: number;
  readonly noteId: string;
}

// Empty streams stand in for `reader.table(...).stream(...)`, so the
// counts cover the combinators' types rather than the initializer's.
const notesLayout = QueryStreamKeyLayout.fromIndex(["text", "_creationTime"]);
const messagesLayout = QueryStreamKeyLayout.fromIndex(["_creationTime"]);
const notes = QueryStream.empty<Note>()(notesLayout);
const moreNotes = QueryStream.empty<Note>()(notesLayout);
const messagesOf = (_note: Note) =>
  QueryStream.empty<Message>()(messagesLayout);
const paginationOpts: QueryStream.PaginateOptions = {
  numItems: 10,
  cursor: null,
};

bench("filter", () => {
  return QueryStream.filter(notes, (note) => note.tag !== "hidden");
}).types([186, "instantiations"]);

bench("merge", () => {
  return QueryStream.merge([notes, moreNotes]);
}).types([52, "instantiations"]);

bench("flatMap", () => {
  return QueryStream.flatMap(notes, messagesOf, {
    innerLayout: messagesLayout,
  });
}).types([156, "instantiations"]);

bench("stream → filter → merge → flatMap → paginate", () => {
  return QueryStream.merge([
    QueryStream.filter(notes, (note) => note.tag !== "hidden"),
    moreNotes,
  ]).pipe(
    QueryStream.flatMap(messagesOf, {
      innerLayout: messagesLayout,
    }),
    QueryStream.paginate(paginationOpts),
  );
}).types([486, "instantiations"]);
