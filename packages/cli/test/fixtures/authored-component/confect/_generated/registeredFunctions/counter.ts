import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import tableNames from "../tableNames";
import { target } from "../id";
import groupLayer from "../../counter.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../counter.spec")["default"]>(tableNames, groupLayer, target);

export default {
["create"]: RegisteredConvexFunction.register({ ...definitions["create"], handler: forward(definitions["create"].handler) }),
["list"]: RegisteredConvexFunction.register({ ...definitions["list"], handler: forward(definitions["list"].handler) }),
["reject"]: RegisteredConvexFunction.register({ ...definitions["reject"], handler: forward(definitions["reject"].handler) }),
["privateValue"]: RegisteredConvexFunction.register({ ...definitions["privateValue"], handler: forward(definitions["privateValue"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../counter.spec")["default"]>;
