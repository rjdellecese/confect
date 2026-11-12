import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import filterNotes from "./tables/filterNotes";
import httpVectors from "./tables/httpVectors";
import transactionNotes from "./tables/transactionNotes";

export default $defineSchema({
  filterNotes: $Table.tableDefinition(filterNotes),
  httpVectors: $Table.tableDefinition(httpVectors),
  transactionNotes: $Table.tableDefinition(transactionNotes),
});
