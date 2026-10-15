import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import groupLayer from "../../../notes_and_random/notes.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../notes_and_random/notes.spec")["default"]>(databaseSchema, groupLayer);

export default {
["insert"]: RegisteredConvexFunction.register({ ...definitions["insert"], handler: forward(definitions["insert"].handler) }),
["list"]: RegisteredConvexFunction.register({ ...definitions["list"], handler: forward(definitions["list"].handler) }),
["delete_"]: RegisteredConvexFunction.register({ ...definitions["delete_"], handler: forward(definitions["delete_"].handler) }),
["listPaginated"]: RegisteredConvexFunction.register({ ...definitions["listPaginated"], handler: forward(definitions["listPaginated"].handler) }),
["insertAuthored"]: RegisteredConvexFunction.register({ ...definitions["insertAuthored"], handler: forward(definitions["insertAuthored"].handler) }),
["feed"]: RegisteredConvexFunction.register({ ...definitions["feed"], handler: forward(definitions["feed"].handler) }),
["getOrFail"]: RegisteredConvexFunction.register({ ...definitions["getOrFail"], handler: forward(definitions["getOrFail"].handler) }),
["getFirst"]: RegisteredConvexFunction.register({ ...definitions["getFirst"], handler: forward(definitions["getFirst"].handler) }),
["internalGetFirst"]: RegisteredConvexFunction.register({ ...definitions["internalGetFirst"], handler: forward(definitions["internalGetFirst"].handler) }),
["clearAll"]: RegisteredConvexFunction.register({ ...definitions["clearAll"], handler: forward(definitions["clearAll"].handler) }),
["insertDefault"]: RegisteredConvexFunction.register({ ...definitions["insertDefault"], handler: forward(definitions["insertDefault"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../notes_and_random/notes.spec")["default"]>;
