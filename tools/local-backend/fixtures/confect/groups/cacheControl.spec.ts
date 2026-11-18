import { FunctionSpec, GroupSpec } from "@confect/core";
import type { control, snapshot } from "./cacheControl.native";

export default GroupSpec.make({ convexModule: true })
  .addFunction(FunctionSpec.convexPublicQuery<typeof control>()("control"))
  .addFunction(FunctionSpec.convexPublicQuery<typeof snapshot>()("snapshot"));
