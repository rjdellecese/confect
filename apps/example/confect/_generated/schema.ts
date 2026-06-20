import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import notes from "./tables/notes";
import tags from "./tables/tags";
import users from "./tables/users";

const databaseSchema: $DatabaseSchema.DatabaseSchema<
  typeof notes |
  typeof tags |
  typeof users
> = $DatabaseSchema.make({
  notes,
  tags,
  users,
});

export default databaseSchema;
