import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import groupLayer from "../../../groups/random.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/random.spec")["default"]>([], groupLayer);

/**
 * Registration tree consumed by the generated Convex entry point. Implement
 * handlers with `FunctionImpl.make` from `confect/_generated/server`. To invoke
 * a function, pass a leaf from `confect/_generated/refs` to a client or runner
 * rather than importing this tree.
 *
 * @internal
 */
export default {
["getNumber"]: RegisteredConvexFunction.register({ ...definitions["getNumber"], handler: forward(definitions["getNumber"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/random.spec")["default"]>;
