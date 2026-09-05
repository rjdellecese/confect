import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import counters from "./tables/counters";

import { target } from "./id";
const databaseSchema: $DatabaseSchema.DatabaseSchema<typeof counters, typeof target> = $DatabaseSchema.make({ counters }, target);
export default databaseSchema;
