import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import groupLayer from "../../../groups/metadata.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/metadata.spec")["default"]>(databaseSchema, groupLayer);

export default {
["queryMetadata"]: RegisteredConvexFunction.register({ ...definitions["queryMetadata"], handler: forward(definitions["queryMetadata"].handler) }),
["mutationMetadata"]: RegisteredConvexFunction.register({ ...definitions["mutationMetadata"], handler: forward(definitions["mutationMetadata"].handler) }),
["actionMetadata"]: RegisteredConvexFunction.register({ ...definitions["actionMetadata"], handler: forward(definitions["actionMetadata"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/metadata.spec")["default"]>;
