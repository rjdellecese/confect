import { defineSchema as $defineSchema } from "convex/server";

import notes from "./tables/notes";
import tags from "./tables/tags";
import users from "./tables/users";

export default $defineSchema({
  notes: notes.tableDefinition,
  tags: tags.tableDefinition,
  users: users.tableDefinition,
});
