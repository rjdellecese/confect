import { FunctionSpec, GroupSpec } from "@confect/core";
import type { paginate, paginateTwice, roundTrip } from "./nativeComponents";

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.convexPublicMutation<typeof roundTrip>()("roundTrip"),
  )
  .addFunction(FunctionSpec.convexPublicQuery<typeof paginate>()("paginate"))
  .addFunction(
    FunctionSpec.convexPublicQuery<typeof paginateTwice>()("paginateTwice"),
  );
