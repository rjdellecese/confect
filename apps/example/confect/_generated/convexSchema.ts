import * as $ConvexSchema from "@confect/server/ConvexSchema";

import notes from "./tables/notes";
import tags from "./tables/tags";
import users from "./tables/users";

export default $ConvexSchema.make({
  notes,
  tags,
  users,
});
