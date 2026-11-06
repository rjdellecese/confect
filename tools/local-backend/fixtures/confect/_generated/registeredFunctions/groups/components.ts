import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import groupLayer from "../../../groups/components.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/components.spec")["default"]>(databaseSchema, groupLayer);

export default {
["exercise"]: RegisteredConvexFunction.register({ ...definitions["exercise"], handler: forward(definitions["exercise"].handler) }),
["schedule"]: RegisteredConvexFunction.register({ ...definitions["schedule"], handler: forward(definitions["schedule"].handler) }),
["list"]: RegisteredConvexFunction.register({ ...definitions["list"], handler: forward(definitions["list"].handler) }),
["uploadUrl"]: RegisteredConvexFunction.register({ ...definitions["uploadUrl"], handler: forward(definitions["uploadUrl"].handler) }),
["storageUrl"]: RegisteredConvexFunction.register({ ...definitions["storageUrl"], handler: forward(definitions["storageUrl"].handler) }),
["hasAuth"]: RegisteredConvexFunction.register({ ...definitions["hasAuth"], handler: forward(definitions["hasAuth"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/components.spec")["default"]>;
