import { DatabaseSchema } from "@rjdellecese/confect";
import { Note } from "./tables/note";
import { Tag } from "./tables/tag";
import { User } from "./tables/user";

export default DatabaseSchema.make()
  .addTable(Note)
  .addTable(User)
  .addTable(Tag);
