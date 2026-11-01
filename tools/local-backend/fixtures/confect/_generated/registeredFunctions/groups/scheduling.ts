import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import groupLayer from "../../../groups/scheduling.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/scheduling.spec")["default"]>(databaseSchema, groupLayer);

export default {
["manyOpsQuery"]: RegisteredConvexFunction.register({ ...definitions["manyOpsQuery"], handler: forward(definitions["manyOpsQuery"].handler) }),
["manyOpsMutation"]: RegisteredConvexFunction.register({ ...definitions["manyOpsMutation"], handler: forward(definitions["manyOpsMutation"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/scheduling.spec")["default"]>;
