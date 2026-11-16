import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import httpVectors from "./tables/httpVectors";
import transactionNotes from "./tables/transactionNotes";

/**
 * Runtime table and codec registry for Confect handlers and test setup.
 * Table schemas stay lazy until accessed. Use convexSchema instead for Convex deployment validators.
 * @category Schemas
 */
const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly httpVectors: typeof httpVectors;
  readonly transactionNotes: typeof transactionNotes;
}> = $DatabaseSchema.make({
  httpVectors,
  transactionNotes,
});

export default databaseSchema;
