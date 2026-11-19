import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import eventsTable from "./tables/events";
import notesTable from "./tables/notes";
import tagsTable from "./tables/tags";
import usersTable from "./tables/users";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly events: typeof eventsTable;
  readonly notes: typeof notesTable;
  readonly tags: typeof tagsTable;
  readonly users: typeof usersTable;
}> = $DatabaseSchema.make({
  events: eventsTable,
  notes: notesTable,
  tags: tagsTable,
  users: usersTable,
});

export default databaseSchema;
