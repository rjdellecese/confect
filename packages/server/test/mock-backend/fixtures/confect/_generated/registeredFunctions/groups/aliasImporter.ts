import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import aliasImporter from "../../../groups/aliasImporter.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/aliasImporter.spec")["default"]>(databaseSchema, aliasImporter);

export default {
["echo"]: RegisteredConvexFunction.register({ ...definitions["echo"], handler: forward(definitions["echo"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/aliasImporter.spec")["default"]>;
