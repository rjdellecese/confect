import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import notes from "./tables/notes";
import tags from "./tables/tags";
import users from "./tables/users";

/**
 * Runtime table and codec registry for Confect handlers and test setup.
 * Table schemas stay lazy until accessed. Use convexSchema instead for Convex deployment validators.
 */
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
