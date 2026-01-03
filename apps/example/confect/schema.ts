import { DatabaseSchema } from "@confect/server";
import { Note } from "./tables/Note";
import { Tag } from "./tables/Tag";
import { User } from "./tables/User";

export default DatabaseSchema.make()
  .addTable(Note)
  .addTable(User)
  .addTable(Tag);
