import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import httpVectorsTable from "./tables/httpVectors";
import transactionNotesTable from "./tables/transactionNotes";

export default $defineSchema({
  httpVectors: $Table.tableDefinition(httpVectorsTable),
  transactionNotes: $Table.tableDefinition(transactionNotesTable),
});
