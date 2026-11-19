import { defineSchema as defineSchema_ } from "convex/server";
import { Table as Table_ } from "@confect/server";

import countersTable from "./tables/counters";

export default defineSchema_({
  counters: Table_.tableDefinition(countersTable),
});
