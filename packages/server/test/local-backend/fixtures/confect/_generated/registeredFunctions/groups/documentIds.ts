import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import groupLayer from "../../../groups/documentIds.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/documentIds.spec")["default"]>(databaseSchema, groupLayer);

export default {
["nativeSampleId"]: RegisteredConvexFunction.register({ ...definitions["nativeSampleId"], handler: forward(definitions["nativeSampleId"].handler) }),
["inspect"]: RegisteredConvexFunction.register({ ...definitions["inspect"], handler: forward(definitions["inspect"].handler) }),
["inspectFromMutation"]: RegisteredConvexFunction.register({ ...definitions["inspectFromMutation"], handler: forward(definitions["inspectFromMutation"].handler) }),
["createAndDelete"]: RegisteredConvexFunction.register({ ...definitions["createAndDelete"], handler: forward(definitions["createAndDelete"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/documentIds.spec")["default"]>;
