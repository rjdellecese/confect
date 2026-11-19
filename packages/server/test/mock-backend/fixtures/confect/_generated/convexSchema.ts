import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import eventsTable from "./tables/events";
import notesTable from "./tables/notes";
import tagsTable from "./tables/tags";
import usersTable from "./tables/users";

export default $defineSchema({
  events: $Table.tableDefinition(eventsTable),
  notes: $Table.tableDefinition(notesTable),
  tags: $Table.tableDefinition(tagsTable),
  users: $Table.tableDefinition(usersTable),
});
