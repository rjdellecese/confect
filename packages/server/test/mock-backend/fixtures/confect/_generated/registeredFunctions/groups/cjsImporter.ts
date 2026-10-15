import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import groupLayer from "../../../groups/cjsImporter.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/cjsImporter.spec")["default"]>(databaseSchema, groupLayer);

export default {
["now"]: RegisteredConvexFunction.register({ ...definitions["now"], handler: forward(definitions["now"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/cjsImporter.spec")["default"]>;
