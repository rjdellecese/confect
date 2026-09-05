import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import { target } from "./id";
const databaseSchema: $DatabaseSchema.DatabaseSchema<never, typeof target> = $DatabaseSchema.make({  }, target);
export default databaseSchema;
