import { DatabaseSchema } from "@confect/server";

import notes from "./tables/notes";
import tags from "./tables/tags";
import users from "./tables/users";

export default DatabaseSchema.make()
  .addTable(notes)
  .addTable(tags)
  .addTable(users);
