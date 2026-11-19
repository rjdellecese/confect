import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import notesTable from "./tables/notes";
import tagsTable from "./tables/tags";
import usersTable from "./tables/users";

export default $defineSchema({
  notes: $Table.tableDefinition(notesTable),
  tags: $Table.tableDefinition(tagsTable),
  users: $Table.tableDefinition(usersTable),
});
