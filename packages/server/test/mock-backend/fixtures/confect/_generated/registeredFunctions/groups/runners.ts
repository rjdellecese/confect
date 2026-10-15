import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import groupLayer from "../../../groups/runners.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/runners.spec")["default"]>(databaseSchema, groupLayer);

export default {
["insertNoteViaRunner"]: RegisteredConvexFunction.register({ ...definitions["insertNoteViaRunner"], handler: forward(definitions["insertNoteViaRunner"].handler) }),
["getNumberViaRunner"]: RegisteredConvexFunction.register({ ...definitions["getNumberViaRunner"], handler: forward(definitions["getNumberViaRunner"].handler) }),
["countNotesViaRunner"]: RegisteredConvexFunction.register({ ...definitions["countNotesViaRunner"], handler: forward(definitions["countNotesViaRunner"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/runners.spec")["default"]>;
