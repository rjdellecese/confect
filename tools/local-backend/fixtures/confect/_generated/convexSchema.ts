import { defineSchema as defineSchema_ } from "convex/server";
import { Table as Table_ } from "@confect/server";

import httpVectorsTable from "./tables/httpVectors";
import transactionNotesTable from "./tables/transactionNotes";

/**
 * Convex schema containing the validators and indexes for every application table.
 * Use it for deployment or pass it to the test backend.
 *
 * **Gotchas**
 *
 * Importing this module constructs every table's deployment definition. Import
 * individual handles from `_generated/tables` in function implementations.
 *
 * @category schemas
 */
export default defineSchema_({
  httpVectors: Table_.tableDefinition(httpVectorsTable),
  transactionNotes: Table_.tableDefinition(transactionNotesTable),
});
