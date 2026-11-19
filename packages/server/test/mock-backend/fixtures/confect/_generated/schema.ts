import { DatabaseSchema as DatabaseSchema_ } from "@confect/server";

import eventsTable from "./tables/events";
import notesTable from "./tables/notes";
import tagsTable from "./tables/tags";
import usersTable from "./tables/users";

const databaseSchema: DatabaseSchema_.DatabaseSchema<{
  readonly events: typeof eventsTable;
  readonly notes: typeof notesTable;
  readonly tags: typeof tagsTable;
  readonly users: typeof usersTable;
}> = DatabaseSchema_.make({
  events: eventsTable,
  notes: notesTable,
  tags: tagsTable,
  users: usersTable,
});

export default databaseSchema;
