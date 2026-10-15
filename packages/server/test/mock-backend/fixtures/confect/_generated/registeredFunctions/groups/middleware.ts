import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import groupLayer from "../../../groups/middleware.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/middleware.spec")["default"]>(databaseSchema, groupLayer);

export default {
["viewerName"]: RegisteredConvexFunction.register({ ...definitions["viewerName"], handler: forward(definitions["viewerName"].handler) }),
["viewerNameMutation"]: RegisteredConvexFunction.register({ ...definitions["viewerNameMutation"], handler: forward(definitions["viewerNameMutation"].handler) }),
["viewerNameAction"]: RegisteredConvexFunction.register({ ...definitions["viewerNameAction"], handler: forward(definitions["viewerNameAction"].handler) }),
["firstNoteForViewer"]: RegisteredConvexFunction.register({ ...definitions["firstNoteForViewer"], handler: forward(definitions["firstNoteForViewer"].handler) }),
["shoutName"]: RegisteredConvexFunction.register({ ...definitions["shoutName"], handler: forward(definitions["shoutName"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/middleware.spec")["default"]>;
