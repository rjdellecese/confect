import { Table } from "@confect/server";
import { Schema } from "effect";

export const Users = Table.make(
  "users",
  Schema.Struct({
    username: Schema.String,
  }),
);
