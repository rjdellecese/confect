import { GroupSpec } from "@confect/core";
import { cacheControl } from "./groups/cacheControl.spec";
import { cacheStubbed } from "./groups/cacheStubbed.spec";

export const groups = GroupSpec.make("groups")
  .addGroup(cacheControl)
  .addGroup(cacheStubbed);
