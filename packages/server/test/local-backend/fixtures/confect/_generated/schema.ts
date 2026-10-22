import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import orderedRows from "./tables/orderedRows";
import transactionNotes from "./tables/transactionNotes";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly orderedRows: typeof orderedRows;
  readonly transactionNotes: typeof transactionNotes;
}> = $DatabaseSchema.make({
  orderedRows,
  transactionNotes,
});

export default databaseSchema;
