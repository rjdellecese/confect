import { ConfectApiGroup } from "@rjdellecese/confect";
import { Notes } from "./groups/notes";
import { Random } from "./groups/random";

export const Groups = ConfectApiGroup.make("groups")
  .addGroup(Notes)
  .addGroup(Random);
