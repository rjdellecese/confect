import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import notesTable from "./tables/notes";
import tagsTable from "./tables/tags";
import usersTable from "./tables/users";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly notes: typeof notesTable;
  readonly tags: typeof tagsTable;
  readonly users: typeof usersTable;
}> = $DatabaseSchema.make({
  notes: notesTable,
  tags: tagsTable,
  users: usersTable,
});

export default databaseSchema;
