import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import tableNames from "../../tableNames";
import groupLayer from "../../../groups/cacheStubbed.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/cacheStubbed.spec")["default"]>(tableNames, groupLayer);

/**
 * Registration tree consumed by the generated Convex entry point. Implement
 * handlers with `FunctionImpl.make` from `confect/_generated/server`. To invoke
 * a function, pass a leaf from `confect/_generated/refs` to a client or runner
 * rather than importing this tree.
 *
 * @internal
 */
export default {
["confectWithSnapshot"]: RegisteredConvexFunction.register({ ...definitions["confectWithSnapshot"], handler: forward(definitions["confectWithSnapshot"].handler) }),
["confectNoTime"]: RegisteredConvexFunction.register({ ...definitions["confectNoTime"], handler: forward(definitions["confectNoTime"].handler) }),
["confectWithClock"]: RegisteredConvexFunction.register({ ...definitions["confectWithClock"], handler: forward(definitions["confectWithClock"].handler) }),
["confectWithRawDateNow"]: RegisteredConvexFunction.register({ ...definitions["confectWithRawDateNow"], handler: forward(definitions["confectWithRawDateNow"].handler) }),
["confectWithSpan"]: RegisteredConvexFunction.register({ ...definitions["confectWithSpan"], handler: forward(definitions["confectWithSpan"].handler) }),
["confectWithLog"]: RegisteredConvexFunction.register({ ...definitions["confectWithLog"], handler: forward(definitions["confectWithLog"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/cacheStubbed.spec")["default"]>;
