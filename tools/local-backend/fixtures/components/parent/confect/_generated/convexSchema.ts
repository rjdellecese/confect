import { defineSchema as defineSchema_ } from "convex/server";

/**
 * Convex schema containing the validators and indexes for every component table.
 * Use it for deployment or pass it to the test backend.
 *
 * **Gotchas**
 *
 * Importing this module constructs every table's deployment definition. Import
 * individual handles from `_generated/tables` in function implementations.
 *
 * @category schemas
 */
export default defineSchema_({});
