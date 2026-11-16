import { defineSchema as defineSchema_ } from "convex/server";
import { Table as Table_ } from "@confect/server";

import httpVectorsTable from "./tables/httpVectors";
import transactionNotesTable from "./tables/transactionNotes";

/**
 * Convex validators and indexes for deployment and convex-test setup.
 * Importing this module constructs every table's deployment definition.
 * In function implementations, import individual handles from _generated/tables instead.
 * @category Deployment
 */
export default defineSchema_({
  httpVectors: Table_.tableDefinition(httpVectorsTable),
  transactionNotes: Table_.tableDefinition(transactionNotesTable),
});
