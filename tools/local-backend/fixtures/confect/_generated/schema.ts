import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import httpVectorsTable from "./tables/httpVectors";
import transactionNotesTable from "./tables/transactionNotes";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly httpVectors: typeof httpVectorsTable;
  readonly transactionNotes: typeof transactionNotesTable;
}> = $DatabaseSchema.make({
  httpVectors: httpVectorsTable,
  transactionNotes: transactionNotesTable,
});

export default databaseSchema;
