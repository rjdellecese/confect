import { defineSchema as defineSchema_ } from "convex/server";
import { Table as Table_ } from "@confect/server";

import httpVectorsTable from "./tables/httpVectors";
import transactionNotesTable from "./tables/transactionNotes";

export default defineSchema_({
  httpVectors: Table_.tableDefinition(httpVectorsTable),
  transactionNotes: Table_.tableDefinition(transactionNotesTable),
});
