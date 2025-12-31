import { ConfectSchema, ConfectTable } from "@rjdellecese/confect";
import { Schema } from "effect";

const Note = ConfectTable.make({
  name: "notes",
  fields: Schema.Struct({
    content: Schema.String,
  }),
});

export default ConfectSchema.make().addTable(Note);
