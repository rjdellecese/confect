import { bench } from "confect-bench-harness";
import type { GenericId } from "@confect/core/GenericId";
import * as SystemFields from "@confect/core/SystemFields";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";

const NoteSchema = Schema.Struct({
  content: Schema.String,
  tag: Schema.optionalKey(Schema.String),
  author: Schema.optionalKey(
    Schema.Struct({
      role: Schema.Literals(["admin", "user"]),
      name: Schema.String,
    }),
  ),
});

const tableName = "notes" as const;

const convexNote = {
  content: "Hello, world!",
  tag: "greeting",
  author: { role: "admin" as const, name: "Alice" },
  _id: "abc123" as GenericId<typeof tableName>,
  _creationTime: 1_234_567_890,
};

const extendedSchema = SystemFields.extendWithSystemFields(
  tableName,
  NoteSchema,
);

const cachedDecoder = Schema.decodeUnknownResult(extendedSchema);

const decodedNote = Schema.decodeResult(extendedSchema)(convexNote).pipe(
  Result.getOrThrow,
);

const cachedEncoder = Schema.encodeResult(NoteSchema);

bench("decode document (recompile decoder each call)", () => {
  Schema.decodeResult(
    SystemFields.extendWithSystemFields(tableName, NoteSchema),
  )(convexNote).pipe(Result.getOrThrow);
}).median([21.71, "us"]);

bench("decode document (cached decoder)", () => {
  cachedDecoder(convexNote).pipe(Result.getOrThrow);
}).median([2.34, "us"]);

bench("encode document (recompile encoder each call)", () => {
  Schema.encodeResult(NoteSchema)(decodedNote).pipe(Result.getOrThrow);
}).median([2.18, "us"]);

bench("encode document (cached encoder)", () => {
  cachedEncoder(decodedNote).pipe(Result.getOrThrow);
}).median([2.09, "us"]);
