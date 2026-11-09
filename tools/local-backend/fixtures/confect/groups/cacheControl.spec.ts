import { FunctionSpec, GroupSpec } from "@confect/core";
import type { control, snapshot } from "./cacheControl";

export default GroupSpec.make()
  .addFunction(FunctionSpec.convexPublicQuery<typeof control>()("control"))
  .addFunction(FunctionSpec.convexPublicQuery<typeof snapshot>()("snapshot"));
