import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import transactionNotes from "./tables/transactionNotes";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly transactionNotes: typeof transactionNotes;
}> = $DatabaseSchema.make({
  transactionNotes,
});

export default databaseSchema;
