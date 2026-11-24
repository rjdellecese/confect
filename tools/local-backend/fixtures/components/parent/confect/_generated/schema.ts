import { DatabaseSchema as DatabaseSchema_ } from "@confect/server";
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
const databaseSchema: DatabaseSchema_.DatabaseSchema<{}, typeof $target> = DatabaseSchema_.make({}, $target);

export default databaseSchema;
