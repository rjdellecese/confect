import { bench } from "@ark/attest";
import type { GenericId } from "@confect/core/GenericId";
import * as SystemFields from "@confect/core/SystemFields";
import * as Schema from "effect/Schema";

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

const cachedDecoder = Schema.decodeUnknownSync(extendedSchema);

const decodedNote = Schema.decodeUnknownSync(extendedSchema)(convexNote);

const cachedEncoder = Schema.encodeSync(NoteSchema);

bench("decode document (recompile decoder each call)", () => {
  Schema.decodeUnknownSync(
    SystemFields.extendWithSystemFields(tableName, NoteSchema),
  )(convexNote);
}).median([46.06, "us"]);

bench("decode document (cached decoder)", () => {
  cachedDecoder(convexNote);
}).median([741.33, "ns"]);

bench("encode document (recompile encoder each call)", () => {
  Schema.encodeSync(NoteSchema)(decodedNote);
}).median([0.59, "us"]);

bench("encode document (cached encoder)", () => {
  cachedEncoder(decodedNote);
}).median([541.55, "ns"]);
