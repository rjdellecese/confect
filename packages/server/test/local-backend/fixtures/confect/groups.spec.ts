import { GroupSpec } from "@confect/core";
import { cacheControl } from "./groups/cacheControl.spec";
import { cacheStubbing } from "./groups/cacheStubbing.spec";

export const groups = GroupSpec.make("groups")
  .addGroup(cacheControl)
  .addGroup(cacheStubbing);
