import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import tableNames from "../../tableNames";
import groupLayer from "../../../groups/notes.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/notes.spec")["default"]>(tableNames, groupLayer);

/**
 * Registration tree consumed by the generated Convex entry point. Implement
 * handlers with `FunctionImpl.make` from `confect/_generated/server`. To invoke
 * a function, pass a leaf from `confect/_generated/refs` to a client or runner
 * rather than importing this tree.
 *
 * @internal
 */
export default {
["insert"]: RegisteredConvexFunction.register({ ...definitions["insert"], handler: forward(definitions["insert"].handler) }),
["list"]: RegisteredConvexFunction.register({ ...definitions["list"], handler: forward(definitions["list"].handler) }),
["delete_"]: RegisteredConvexFunction.register({ ...definitions["delete_"], handler: forward(definitions["delete_"].handler) }),
["getFirst"]: RegisteredConvexFunction.register({ ...definitions["getFirst"], handler: forward(definitions["getFirst"].handler) }),
["internalGetFirst"]: RegisteredConvexFunction.register({ ...definitions["internalGetFirst"], handler: forward(definitions["internalGetFirst"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/notes.spec")["default"]>;
