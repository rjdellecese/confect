import { FunctionSpec, GroupSpec } from "@confect/core";
import type { backgroundWork, enqueue, onComplete, status } from "./workpool";

export const workpool = GroupSpec.make("workpool")
  .addFunction(FunctionSpec.convexPublicMutation<typeof enqueue>()("enqueue"))
  .addFunction(FunctionSpec.convexPublicQuery<typeof status>()("status"))
  .addFunction(
    FunctionSpec.convexInternalAction<typeof backgroundWork>()(
      "backgroundWork",
    ),
  )
  .addFunction(
    FunctionSpec.convexInternalMutation<typeof onComplete>()("onComplete"),
  );
