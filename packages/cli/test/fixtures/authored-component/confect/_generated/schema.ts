import { DatabaseSchema as DatabaseSchema_ } from "@confect/server";

import countersTable from "./tables/counters";
import { target as $target } from "./id";

const databaseSchema: DatabaseSchema_.DatabaseSchema<{
  readonly counters: typeof countersTable;
}, typeof $target> = DatabaseSchema_.make({
  counters: countersTable,
}, $target);

export default databaseSchema;
