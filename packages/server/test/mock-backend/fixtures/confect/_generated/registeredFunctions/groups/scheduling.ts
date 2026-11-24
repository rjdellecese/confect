import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import tableNames from "../../tableNames";
import groupLayer from "../../../groups/scheduling.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/scheduling.spec")["default"]>(tableNames, groupLayer);

/**
 * Registration tree consumed by the generated Convex entry point. Implement
 * handlers with `FunctionImpl.make` from `confect/_generated/server`. To invoke
 * a function, pass a leaf from `confect/_generated/refs` to a client or runner
 * rather than importing this tree.
 *
 * @internal
 */
export default {
["manyOpsQuery"]: RegisteredConvexFunction.register({ ...definitions["manyOpsQuery"], handler: forward(definitions["manyOpsQuery"].handler) }),
["manyOpsMutation"]: RegisteredConvexFunction.register({ ...definitions["manyOpsMutation"], handler: forward(definitions["manyOpsMutation"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/scheduling.spec")["default"]>;
