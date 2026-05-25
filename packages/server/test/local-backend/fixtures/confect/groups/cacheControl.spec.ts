import { FunctionSpec, GroupSpec } from "@confect/core";
import type { control } from "./cacheControl";

export default GroupSpec.make().addFunction(
  FunctionSpec.convexPublicQuery<typeof control>()("control"),
);
