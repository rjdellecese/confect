import { FunctionSpec, GroupSpec } from "@confect/core";
import type {
  echoAction,
  echoMutation,
  echoQuery,
  read,
  write,
} from "./clients.native";

export default GroupSpec.make({ convexModule: true })
  .addFunction(FunctionSpec.convexPublicQuery<typeof echoQuery>()("echoQuery"))
  .addFunction(
    FunctionSpec.convexPublicMutation<typeof echoMutation>()("echoMutation"),
  )
  .addFunction(
    FunctionSpec.convexPublicAction<typeof echoAction>()("echoAction"),
  )
  .addFunction(FunctionSpec.convexPublicQuery<typeof read>()("read"))
  .addFunction(FunctionSpec.convexPublicMutation<typeof write>()("write"));
