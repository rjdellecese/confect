import { bench } from "@ark/attest";
import type { GenericId } from "@confect/core/GenericId";
import * as SystemFields from "@confect/core/SystemFields";
import { Schema } from "effect";

const NoteSchema = Schema.Struct({
  content: Schema.String,
  tag: Schema.optionalWith(Schema.String, { exact: true }),
  author: Schema.optionalWith(
    Schema.Struct({
      role: Schema.Literal("admin", "user"),
      name: Schema.String,
    }),
    { exact: true },
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

const cachedDecoder = Schema.decodeUnknownSync(extendedSchema);

const decodedNote = Schema.decodeUnknownSync(extendedSchema)(convexNote);

const cachedEncoder = Schema.encodeSync(NoteSchema);

bench("decode document (recompile decoder each call)", () => {
  Schema.decodeUnknownSync(
    SystemFields.extendWithSystemFields(tableName, NoteSchema),
  )(convexNote);
}).median([27.98, "us"]);

bench("decode document (cached decoder)", () => {
  cachedDecoder(convexNote);
}).median([406.34, "ns"]);

bench("encode document (recompile encoder each call)", () => {
  Schema.encodeSync(NoteSchema)(decodedNote);
}).median([27.98, "us"]);

bench("encode document (cached encoder)", () => {
  cachedEncoder(decodedNote);
}).median([406.34, "ns"]);
