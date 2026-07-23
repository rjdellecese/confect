import * as $ConvexSchema from "@confect/server/ConvexSchema";

import events from "./tables/events";
import notes from "./tables/notes";
import tags from "./tables/tags";
import users from "./tables/users";

export default $ConvexSchema.make({
  events,
  notes,
  tags,
  users,
});
