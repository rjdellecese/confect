import { Table } from "@rjdellecese/confect";
import { Schema } from "effect";

export const User = Table.make(
  "users",
  Schema.Struct({
    username: Schema.String,
  }),
);
