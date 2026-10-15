import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import groupLayer from "../../../groups/cacheStubbed.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/cacheStubbed.spec")["default"]>(databaseSchema, groupLayer);

export default {
["confectNoTime"]: RegisteredConvexFunction.register({ ...definitions["confectNoTime"], handler: forward(definitions["confectNoTime"].handler) }),
["confectWithClock"]: RegisteredConvexFunction.register({ ...definitions["confectWithClock"], handler: forward(definitions["confectWithClock"].handler) }),
["confectWithRawDateNow"]: RegisteredConvexFunction.register({ ...definitions["confectWithRawDateNow"], handler: forward(definitions["confectWithRawDateNow"].handler) }),
["confectWithSpan"]: RegisteredConvexFunction.register({ ...definitions["confectWithSpan"], handler: forward(definitions["confectWithSpan"].handler) }),
["confectWithLog"]: RegisteredConvexFunction.register({ ...definitions["confectWithLog"], handler: forward(definitions["confectWithLog"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/cacheStubbed.spec")["default"]>;
