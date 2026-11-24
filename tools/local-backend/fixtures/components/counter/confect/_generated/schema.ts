import { DatabaseSchema as DatabaseSchema_ } from "@confect/server";

import countersTable from "./tables/counters";
import { target as $target } from "./id";

/**
 * Registry of all component table handles. Import its type when a service or
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
  readonly counters: typeof countersTable;
}, typeof $target> = DatabaseSchema_.make({
  counters: countersTable,
}, $target);

export default databaseSchema;
