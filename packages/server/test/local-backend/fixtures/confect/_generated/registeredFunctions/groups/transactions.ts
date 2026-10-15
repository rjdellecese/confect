import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import groupLayer from "../../../groups/transactions.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/transactions.spec")["default"]>(databaseSchema, groupLayer);

export default {
["read"]: RegisteredConvexFunction.register({ ...definitions["read"], handler: forward(definitions["read"].handler) }),
["write"]: RegisteredConvexFunction.register({ ...definitions["write"], handler: forward(definitions["write"].handler) }),
["seed"]: RegisteredConvexFunction.register({ ...definitions["seed"], handler: forward(definitions["seed"].handler) }),
["limitedRead"]: RegisteredConvexFunction.register({ ...definitions["limitedRead"], handler: forward(definitions["limitedRead"].handler) }),
["limitedReadFromMutation"]: RegisteredConvexFunction.register({ ...definitions["limitedReadFromMutation"], handler: forward(definitions["limitedReadFromMutation"].handler) }),
["limitedWrite"]: RegisteredConvexFunction.register({ ...definitions["limitedWrite"], handler: forward(definitions["limitedWrite"].handler) }),
["rollback"]: RegisteredConvexFunction.register({ ...definitions["rollback"], handler: forward(definitions["rollback"].handler) }),
["staleRead"]: RegisteredConvexFunction.register({ ...definitions["staleRead"], handler: forward(definitions["staleRead"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/transactions.spec")["default"]>;
