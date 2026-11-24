import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import tableNames from "../tableNames";
import groupLayer from "../../env.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../env.spec")["default"]>(tableNames, groupLayer);

/**
 * Registration tree consumed by the generated Convex entry point. Implement
 * handlers with `FunctionImpl.make` from `confect/_generated/server`. To invoke
 * a function, pass a leaf from `confect/_generated/refs` to a client or runner
 * rather than importing this tree.
 *
 * @internal
 */
export default {
["readEnvVar"]: RegisteredConvexFunction.register({ ...definitions["readEnvVar"], handler: forward(definitions["readEnvVar"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../env.spec")["default"]>;
