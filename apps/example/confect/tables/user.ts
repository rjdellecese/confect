import { ConfectTable } from "@rjdellecese/confect";
import { Schema } from "effect";

export const User = ConfectTable.make({
  name: "users",
  fields: Schema.Struct({
    username: Schema.String,
  }),
});
