import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import tableNames from "../tableNames";
import groupLayer from "../../databaseReader.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../databaseReader.spec")["default"]>(tableNames, groupLayer);

/**
 * Registration tree consumed by the generated Convex entry point. Implement
 * handlers with `FunctionImpl.make` from `confect/_generated/server`. To invoke
 * a function, pass a leaf from `confect/_generated/refs` to a client or runner
 * rather than importing this tree.
 *
 * @internal
 */
export default {
["getNote"]: RegisteredConvexFunction.register({ ...definitions["getNote"], handler: forward(definitions["getNote"].handler) }),
["listNotes"]: RegisteredConvexFunction.register({ ...definitions["listNotes"], handler: forward(definitions["listNotes"].handler) }),
["paginateNotes"]: RegisteredConvexFunction.register({ ...definitions["paginateNotes"], handler: forward(definitions["paginateNotes"].handler) }),
["paginateNotesWithFilter"]: RegisteredConvexFunction.register({ ...definitions["paginateNotesWithFilter"], handler: forward(definitions["paginateNotesWithFilter"].handler) }),
["paginateNotesOrFail"]: RegisteredConvexFunction.register({ ...definitions["paginateNotesOrFail"], handler: forward(definitions["paginateNotesOrFail"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../databaseReader.spec")["default"]>;
