import { DatabaseSchema as DatabaseSchema_ } from "@confect/server";

import httpVectorsTable from "./tables/httpVectors";
import transactionNotesTable from "./tables/transactionNotes";

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
  readonly httpVectors: typeof httpVectorsTable;
  readonly transactionNotes: typeof transactionNotesTable;
}> = DatabaseSchema_.make({
  httpVectors: httpVectorsTable,
  transactionNotes: transactionNotesTable,
});

export default databaseSchema;
