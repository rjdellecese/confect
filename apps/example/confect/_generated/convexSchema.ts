import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import notes from "./tables/notes";
import tags from "./tables/tags";
import users from "./tables/users";

export default $defineSchema({
  notes: $Table.tableDefinition(notes),
  tags: $Table.tableDefinition(tags),
  users: $Table.tableDefinition(users),
});
