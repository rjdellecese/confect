import { ConfectApiGroup } from "@rjdellecese/confect/api";
import { Notes } from "./notes";
import { Random } from "./random";

export const Groups = ConfectApiGroup.make("groups")
  .addGroup(Notes)
  .addGroup(Random);
