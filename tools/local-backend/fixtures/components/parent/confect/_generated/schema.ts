import { DatabaseSchema as DatabaseSchema_ } from "@confect/server";
import { target as $target } from "./id";

const databaseSchema: DatabaseSchema_.DatabaseSchema<{}, typeof $target> = DatabaseSchema_.make({}, $target);

export default databaseSchema;
