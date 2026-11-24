import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import tableNames from "../../tableNames";
import groupLayer from "../../../groups/metadata.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/metadata.spec")["default"]>(tableNames, groupLayer);

/**
 * Registration tree consumed by the generated Convex entry point. Implement
 * handlers with `FunctionImpl.make` from `confect/_generated/server`. To invoke
 * a function, pass a leaf from `confect/_generated/refs` to a client or runner
 * rather than importing this tree.
 *
 * @internal
 */
export default {
["queryMetadata"]: RegisteredConvexFunction.register({ ...definitions["queryMetadata"], handler: forward(definitions["queryMetadata"].handler) }),
["mutationMetadata"]: RegisteredConvexFunction.register({ ...definitions["mutationMetadata"], handler: forward(definitions["mutationMetadata"].handler) }),
["snapshotMutation"]: RegisteredConvexFunction.register({ ...definitions["snapshotMutation"], handler: forward(definitions["snapshotMutation"].handler) }),
["actionMetadata"]: RegisteredConvexFunction.register({ ...definitions["actionMetadata"], handler: forward(definitions["actionMetadata"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/metadata.spec")["default"]>;
