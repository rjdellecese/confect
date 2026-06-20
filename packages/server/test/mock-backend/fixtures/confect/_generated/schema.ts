import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import events from "./tables/events";
import notes from "./tables/notes";
import tags from "./tables/tags";
import users from "./tables/users";

export default $DatabaseSchema.make({
  events,
  notes,
  tags,
  users,
});
