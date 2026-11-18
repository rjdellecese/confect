import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import { tableNames } from "../../tableNames";
import groupLayer from "../../../groups/authentication.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/authentication.spec")["default"]>(tableNames, groupLayer);

export default {
["sign"]: RegisteredConvexFunction.register({ ...definitions["sign"], handler: forward(definitions["sign"].handler) }),
["signInMiddleware"]: RegisteredConvexFunction.register({ ...definitions["signInMiddleware"], handler: forward(definitions["signInMiddleware"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/authentication.spec")["default"]>;
