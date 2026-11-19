import { DatabaseSchema as DatabaseSchema_ } from "@confect/server";

import httpVectorsTable from "./tables/httpVectors";
import transactionNotesTable from "./tables/transactionNotes";

const databaseSchema: DatabaseSchema_.DatabaseSchema<{
  readonly httpVectors: typeof httpVectorsTable;
  readonly transactionNotes: typeof transactionNotesTable;
}> = DatabaseSchema_.make({
  httpVectors: httpVectorsTable,
  transactionNotes: transactionNotesTable,
});

export default databaseSchema;
