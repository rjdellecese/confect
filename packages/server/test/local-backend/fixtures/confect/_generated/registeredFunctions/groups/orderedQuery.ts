import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import groupLayer from "../../../groups/orderedQuery.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/orderedQuery.spec")["default"]>(databaseSchema, groupLayer);

export default {
["seed"]: RegisteredConvexFunction.register({ ...definitions["seed"], handler: forward(definitions["seed"].handler) }),
["first"]: RegisteredConvexFunction.register({ ...definitions["first"], handler: forward(definitions["first"].handler) }),
["take"]: RegisteredConvexFunction.register({ ...definitions["take"], handler: forward(definitions["take"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/orderedQuery.spec")["default"]>;
