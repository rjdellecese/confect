import { Schema } from "effect";
import { Table } from "../../../src/index";

export const Users = Table.make(
  "users",
  Schema.Struct({
    username: Schema.String,
  }),
);
