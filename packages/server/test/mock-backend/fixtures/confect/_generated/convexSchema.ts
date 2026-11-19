import { defineSchema as defineSchema_ } from "convex/server";
import { Table as Table_ } from "@confect/server";

import eventsTable from "./tables/events";
import notesTable from "./tables/notes";
import tagsTable from "./tables/tags";
import usersTable from "./tables/users";

export default defineSchema_({
  events: Table_.tableDefinition(eventsTable),
  notes: Table_.tableDefinition(notesTable),
  tags: Table_.tableDefinition(tagsTable),
  users: Table_.tableDefinition(usersTable),
});
