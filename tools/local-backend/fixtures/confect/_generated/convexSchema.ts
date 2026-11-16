import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import httpVectors from "./tables/httpVectors";
import transactionNotes from "./tables/transactionNotes";

/**
 * Convex validators and indexes for deployment and convex-test setup.
 * Importing this module constructs every table's deployment definition.
 * Use the runtime schema module in function implementations instead.
 * @category Deployment
 */
export default $defineSchema({
  httpVectors: $Table.tableDefinition(httpVectors),
  transactionNotes: $Table.tableDefinition(transactionNotes),
});
