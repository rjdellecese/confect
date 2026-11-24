import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import tableNames from "../../tableNames";
import groupLayer from "../../../groups/components.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/components.spec")["default"]>(tableNames, groupLayer);

/**
 * Registration tree consumed by the generated Convex entry point. Implement
 * handlers with `FunctionImpl.make` from `confect/_generated/server`. To invoke
 * a function, pass a leaf from `confect/_generated/refs` to a client or runner
 * rather than importing this tree.
 *
 * @internal
 */
export default {
["seedPagination"]: RegisteredConvexFunction.register({ ...definitions["seedPagination"], handler: forward(definitions["seedPagination"].handler) }),
["paginate"]: RegisteredConvexFunction.register({ ...definitions["paginate"], handler: forward(definitions["paginate"].handler) }),
["exercise"]: RegisteredConvexFunction.register({ ...definitions["exercise"], handler: forward(definitions["exercise"].handler) }),
["schedule"]: RegisteredConvexFunction.register({ ...definitions["schedule"], handler: forward(definitions["schedule"].handler) }),
["list"]: RegisteredConvexFunction.register({ ...definitions["list"], handler: forward(definitions["list"].handler) }),
["uploadUrl"]: RegisteredConvexFunction.register({ ...definitions["uploadUrl"], handler: forward(definitions["uploadUrl"].handler) }),
["storageUrl"]: RegisteredConvexFunction.register({ ...definitions["storageUrl"], handler: forward(definitions["storageUrl"].handler) }),
["hasAuth"]: RegisteredConvexFunction.register({ ...definitions["hasAuth"], handler: forward(definitions["hasAuth"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/components.spec")["default"]>;
