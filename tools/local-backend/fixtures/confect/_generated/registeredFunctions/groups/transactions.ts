import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import tableNames from "../../tableNames";
import groupLayer from "../../../groups/transactions.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/transactions.spec")["default"]>(tableNames, groupLayer);

/**
 * Registration tree consumed by the generated Convex entry point. Implement
 * handlers with `FunctionImpl.make` from `confect/_generated/server`. To invoke
 * a function, pass a leaf from `confect/_generated/refs` to a client or runner
 * rather than importing this tree.
 *
 * @internal
 */
export default {
["read"]: RegisteredConvexFunction.register({ ...definitions["read"], handler: forward(definitions["read"].handler) }),
["write"]: RegisteredConvexFunction.register({ ...definitions["write"], handler: forward(definitions["write"].handler) }),
["seed"]: RegisteredConvexFunction.register({ ...definitions["seed"], handler: forward(definitions["seed"].handler) }),
["limitedRead"]: RegisteredConvexFunction.register({ ...definitions["limitedRead"], handler: forward(definitions["limitedRead"].handler) }),
["limitedReadFromMutation"]: RegisteredConvexFunction.register({ ...definitions["limitedReadFromMutation"], handler: forward(definitions["limitedReadFromMutation"].handler) }),
["limitedWrite"]: RegisteredConvexFunction.register({ ...definitions["limitedWrite"], handler: forward(definitions["limitedWrite"].handler) }),
["rollback"]: RegisteredConvexFunction.register({ ...definitions["rollback"], handler: forward(definitions["rollback"].handler) }),
["staleRead"]: RegisteredConvexFunction.register({ ...definitions["staleRead"], handler: forward(definitions["staleRead"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/transactions.spec")["default"]>;
