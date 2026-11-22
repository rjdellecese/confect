import { DatabaseSchema as DatabaseSchema_ } from "@confect/server";

import notesTable from "./tables/notes";
import tagsTable from "./tables/tags";
import usersTable from "./tables/users";

/**
 * Registry of all application table handles. Import its type when a service or
 * helper needs the full database model.
 *
 * **Gotchas**
 *
 * A value import loads every table module. In handlers, import individual handles
 * from `_generated/tables` instead.
 *
 * @category schemas
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
