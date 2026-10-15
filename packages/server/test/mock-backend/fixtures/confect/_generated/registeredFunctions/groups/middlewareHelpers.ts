import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import middlewareHelpers from "../../../groups/middlewareHelpers.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/middlewareHelpers.spec")["default"]>(databaseSchema, middlewareHelpers);

export default {
["firstUsername"]: RegisteredConvexFunction.register({ ...definitions["firstUsername"], handler: forward(definitions["firstUsername"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/middlewareHelpers.spec")["default"]>;
