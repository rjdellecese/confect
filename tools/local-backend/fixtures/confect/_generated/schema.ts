import { DatabaseSchema as DatabaseSchema_ } from "@confect/server";

import httpVectorsTable from "./tables/httpVectors";
import transactionNotesTable from "./tables/transactionNotes";

/**
 * Registry of all application table handles. A value import loads every table module.
 * Import the registry as a type for the full database model. In handlers, import only the table handles you use.
 * @category Schemas
 */
const databaseSchema: DatabaseSchema_.DatabaseSchema<{
  readonly httpVectors: typeof httpVectorsTable;
  readonly transactionNotes: typeof transactionNotesTable;
}> = DatabaseSchema_.make({
  httpVectors: httpVectorsTable,
  transactionNotes: transactionNotesTable,
});

export default databaseSchema;
