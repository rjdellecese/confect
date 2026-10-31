import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import transactionNotes from "./tables/transactionNotes";

export default $defineSchema({
  transactionNotes: $Table.tableDefinition(transactionNotes),
});
