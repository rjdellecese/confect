import { FunctionSpec, GroupSpec } from "@confect/core";
import type { roundTrip } from "./nativeComponents";

export default GroupSpec.make().addFunction(
  FunctionSpec.convexPublicMutation<typeof roundTrip>()("roundTrip"),
);
