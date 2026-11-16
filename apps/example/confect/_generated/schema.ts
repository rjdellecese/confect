import { DatabaseSchema as DatabaseSchema_ } from "@confect/server";

import notesTable from "./tables/notes";
import tagsTable from "./tables/tags";
import usersTable from "./tables/users";

/**
 * Registry of all application table handles. A value import loads every table module.
 * Import the registry as a type for the full database model. In handlers, import only the table handles you use.
 * @category Schemas
 */
const databaseSchema: DatabaseSchema_.DatabaseSchema<{
  readonly notes: typeof notesTable;
  readonly tags: typeof tagsTable;
  readonly users: typeof usersTable;
}> = DatabaseSchema_.make({
  notes: notesTable,
  tags: tagsTable,
  users: usersTable,
});

export default databaseSchema;
