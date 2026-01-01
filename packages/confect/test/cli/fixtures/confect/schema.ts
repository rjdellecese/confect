import { DatabaseSchema, Table } from "@rjdellecese/confect";
import { Schema } from "effect";

const Note = Table.make(
  "notes",
  Schema.Struct({
    content: Schema.String,
  }),
);

export default DatabaseSchema.make().addTable(Note);
