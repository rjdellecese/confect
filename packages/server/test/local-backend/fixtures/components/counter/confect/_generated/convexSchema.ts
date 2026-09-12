import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import counters from "./tables/counters";

export default $defineSchema({
  counters: $Table.tableDefinition(counters),
});
