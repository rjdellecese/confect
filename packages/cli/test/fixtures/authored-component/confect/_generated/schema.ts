import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import counters from "./tables/counters";

import { target as $target } from "./id";
const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly counters: typeof counters;
}, typeof $target> = $DatabaseSchema.make({
  counters,
}, $target);

export default databaseSchema;
