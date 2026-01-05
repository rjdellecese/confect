import { GroupSpec } from "@confect/core";
import { notes } from "./groups/notes";
import { random } from "./groups/random";

export const groups = GroupSpec.make("groups").addGroup(notes).addGroup(random);
