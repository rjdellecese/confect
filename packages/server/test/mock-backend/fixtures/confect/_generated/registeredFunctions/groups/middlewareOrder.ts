import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import groupLayer from "../../../groups/middlewareOrder.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/middlewareOrder.spec")["default"]>(databaseSchema, groupLayer);

export default {
["record"]: RegisteredConvexFunction.register({ ...definitions["record"], handler: forward(definitions["record"].handler) }),
["recordPlain"]: RegisteredConvexFunction.register({ ...definitions["recordPlain"], handler: forward(definitions["recordPlain"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/middlewareOrder.spec")["default"]>;
