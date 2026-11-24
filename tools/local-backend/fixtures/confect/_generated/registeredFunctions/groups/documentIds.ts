import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import tableNames from "../../tableNames";
import groupLayer from "../../../groups/documentIds.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/documentIds.spec")["default"]>(tableNames, groupLayer);

/**
 * Registration tree consumed by the generated Convex entry point. Implement
 * handlers with `FunctionImpl.make` from `confect/_generated/server`. To invoke
 * a function, pass a leaf from `confect/_generated/refs` to a client or runner
 * rather than importing this tree.
 *
 * @internal
 */
export default {
["nativeSampleId"]: RegisteredConvexFunction.register({ ...definitions["nativeSampleId"], handler: forward(definitions["nativeSampleId"].handler) }),
["inspect"]: RegisteredConvexFunction.register({ ...definitions["inspect"], handler: forward(definitions["inspect"].handler) }),
["inspectFromMutation"]: RegisteredConvexFunction.register({ ...definitions["inspectFromMutation"], handler: forward(definitions["inspectFromMutation"].handler) }),
["createAndDelete"]: RegisteredConvexFunction.register({ ...definitions["createAndDelete"], handler: forward(definitions["createAndDelete"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/documentIds.spec")["default"]>;
