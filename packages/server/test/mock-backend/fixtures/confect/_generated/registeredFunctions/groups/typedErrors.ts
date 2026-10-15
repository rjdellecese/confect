import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import groupLayer from "../../../groups/typedErrors.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/typedErrors.spec")["default"]>(databaseSchema, groupLayer);

export default {
["getNoteOrFail"]: RegisteredConvexFunction.register({ ...definitions["getNoteOrFail"], handler: forward(definitions["getNoteOrFail"].handler) }),
["deleteNoteOrFail"]: RegisteredConvexFunction.register({ ...definitions["deleteNoteOrFail"], handler: forward(definitions["deleteNoteOrFail"].handler) }),
["failingAction"]: RegisteredConvexFunction.register({ ...definitions["failingAction"], handler: forward(definitions["failingAction"].handler) }),
["insertThenFail"]: RegisteredConvexFunction.register({ ...definitions["insertThenFail"], handler: forward(definitions["insertThenFail"].handler) }),
["tryGetNote"]: RegisteredConvexFunction.register({ ...definitions["tryGetNote"], handler: forward(definitions["tryGetNote"].handler) }),
["tryDeleteNote"]: RegisteredConvexFunction.register({ ...definitions["tryDeleteNote"], handler: forward(definitions["tryDeleteNote"].handler) }),
["tryFailingAction"]: RegisteredConvexFunction.register({ ...definitions["tryFailingAction"], handler: forward(definitions["tryFailingAction"].handler) }),
["internalGetNoteOrFail"]: RegisteredConvexFunction.register({ ...definitions["internalGetNoteOrFail"], handler: forward(definitions["internalGetNoteOrFail"].handler) }),
["tryInternalGetNote"]: RegisteredConvexFunction.register({ ...definitions["tryInternalGetNote"], handler: forward(definitions["tryInternalGetNote"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/typedErrors.spec")["default"]>;
