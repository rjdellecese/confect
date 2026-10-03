import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import notes from "./tables/notes";
import tags from "./tables/tags";
import users from "./tables/users";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly notes: typeof notes;
  readonly tags: typeof tags;
  readonly users: typeof users;
}> = $DatabaseSchema.make({
  notes,
  tags,
  users,
});

export default databaseSchema;
