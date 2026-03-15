import { GroupSpec } from "@confect/core";
import { notes } from "./groups/notes.spec";
import { random } from "./groups/random.spec";
import { runners } from "./groups/runners.spec";

export const groups = GroupSpec.make("groups")
  .addGroup(notes)
  .addGroup(random)
  .addGroup(runners);
