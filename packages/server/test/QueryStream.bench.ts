import { bench } from "confect-bench-harness";
import * as QueryStream from "@confect/server/QueryStream";
import * as Stream from "effect/Stream";

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

// Hand-built leaves stand in for `reader.table(...).stream(...)`, so the
// counts cover the combinators' types rather than the initializer's.
const leaf = <Doc, Key extends ReadonlyArray<string>>(
  keyFields: ReadonlyArray<string>,
) =>
  new QueryStream.QueryStream(
    "asc",
    keyFields,
    Stream.empty,
    undefined,
    undefined,
    [keyFields.length - 1],
  ) as unknown as QueryStream.QueryStream<Doc, Key, never, never, "asc">;

const notes = leaf<Note, ["text", "_creationTime"]>([
  "text",
  "_creationTime",
  "_id",
]);
const moreNotes = leaf<Note, ["text", "_creationTime"]>([
  "text",
  "_creationTime",
  "_id",
]);
const messagesOf = (_note: Note) =>
  leaf<Message, ["_creationTime"]>(["_creationTime", "_id"]);
const paginationOpts: QueryStream.PaginateOptions = {
  numItems: 10,
  cursor: null,
};

bench("filter", () => {
  return QueryStream.filter(notes, (note) => note.tag !== "hidden");
}).types([185, "instantiations"]);

bench("merge", () => {
  return QueryStream.merge([notes, moreNotes]);
}).types([52, "instantiations"]);

bench("flatMap", () => {
  return QueryStream.flatMap(notes, messagesOf, {
    innerKey: ["_creationTime"],
  });
}).types([192, "instantiations"]);

bench("stream → filter → merge → flatMap → paginate", () => {
  return QueryStream.merge([
    QueryStream.filter(notes, (note) => note.tag !== "hidden"),
    moreNotes,
  ]).pipe(
    QueryStream.flatMap(messagesOf, { innerKey: ["_creationTime"] }),
    QueryStream.paginate(paginationOpts),
  );
}).types([2491, "instantiations"]);
