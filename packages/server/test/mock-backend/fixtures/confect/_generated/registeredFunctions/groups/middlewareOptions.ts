import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import tableNames from "../../tableNames";
import groupLayer from "../../../groups/middlewareOptions.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/middlewareOptions.spec")["default"]>(tableNames, groupLayer);

/**
 * Registration tree consumed by the generated Convex entry point. Implement
 * handlers with `FunctionImpl.make` from `confect/_generated/server`. To invoke
 * a function, pass a leaf from `confect/_generated/refs` to a client or runner
 * rather than importing this tree.
 *
 * @internal
 */
export default {
["shortName"]: RegisteredConvexFunction.register({ ...definitions["shortName"], handler: forward(definitions["shortName"].handler) }),
["longName"]: RegisteredConvexFunction.register({ ...definitions["longName"], handler: forward(definitions["longName"].handler) }),
["mutation"]: RegisteredConvexFunction.register({ ...definitions["mutation"], handler: forward(definitions["mutation"].handler) }),
["action"]: RegisteredConvexFunction.register({ ...definitions["action"], handler: forward(definitions["action"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/middlewareOptions.spec")["default"]>;
