import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import events from "./tables/events";
import notes from "./tables/notes";
import tags from "./tables/tags";
import users from "./tables/users";

const databaseSchema: $DatabaseSchema.DatabaseSchema<
  typeof events |
  typeof notes |
  typeof tags |
  typeof users
> = $DatabaseSchema.make({
  events,
  notes,
  tags,
  users,
});

export default databaseSchema;
