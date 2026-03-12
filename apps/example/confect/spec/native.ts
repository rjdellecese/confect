import { FunctionSpec, GroupSpec } from "@confect/core";
import type { noteCount } from "../native/noteCount";

export const native = GroupSpec.make("native").addFunction(
  FunctionSpec.convexPublicQuery<typeof noteCount>()("noteCount"),
);
