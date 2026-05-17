import { FunctionSpec, GroupSpec } from "@confect/core";
import type { control } from "./cacheControl";

export const cacheControl = GroupSpec.make("cacheControl").addFunction(
  FunctionSpec.convexPublicQuery<typeof control>()("control"),
);
