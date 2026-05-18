import { Table } from "@gunta/confect-server";
import { Schema } from "effect";

export const Users = Table.make(
  "users",
  Schema.Struct({
    username: Schema.String,
  }),
);
