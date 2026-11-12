import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import filterNotes from "./tables/filterNotes";
import httpVectors from "./tables/httpVectors";
import transactionNotes from "./tables/transactionNotes";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly filterNotes: typeof filterNotes;
  readonly httpVectors: typeof httpVectors;
  readonly transactionNotes: typeof transactionNotes;
}> = $DatabaseSchema.make({
  filterNotes,
  httpVectors,
  transactionNotes,
});

export default databaseSchema;
