import { ConfectApiGroupSpec } from "@rjdellecese/confect";
import { Notes } from "./groups/notes";
import { Random } from "./groups/random";

export const Groups = ConfectApiGroupSpec.make("groups")
  .addGroup(Notes)
  .addGroup(Random);
