import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import httpVectors from "./tables/httpVectors";
import transactionNotes from "./tables/transactionNotes";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly httpVectors: typeof httpVectors;
  readonly transactionNotes: typeof transactionNotes;
}> = $DatabaseSchema.make({
  httpVectors,
  transactionNotes,
});

export default databaseSchema;
