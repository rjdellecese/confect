import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import orderedRows from "./tables/orderedRows";
import transactionNotes from "./tables/transactionNotes";

export default $defineSchema({
  orderedRows: $Table.tableDefinition(orderedRows),
  transactionNotes: $Table.tableDefinition(transactionNotes),
});
