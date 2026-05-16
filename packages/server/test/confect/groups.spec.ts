import { GroupSpec } from "@confect/core";
import { cacheControl } from "./groups/cacheControl.spec";
import { cacheStubbing } from "./groups/cacheStubbing.spec";
import { notes } from "./groups/notes.spec";
import { random } from "./groups/random.spec";
import { runners } from "./groups/runners.spec";
import { typedErrors } from "./groups/typedErrors.spec";

export const groups = GroupSpec.make("groups")
  .addGroup(cacheControl)
  .addGroup(cacheStubbing)
  .addGroup(notes)
  .addGroup(random)
  .addGroup(runners)
  .addGroup(typedErrors);
