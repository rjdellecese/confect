import { GroupSpec } from "@rjdellecese/confect";
import { Notes } from "./groups/notes";
import { Random } from "./groups/random";

export const Groups = GroupSpec.make("groups").addGroup(Notes).addGroup(Random);
