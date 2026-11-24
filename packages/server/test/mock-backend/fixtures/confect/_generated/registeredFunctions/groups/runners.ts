import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import groupLayer from "../../../groups/runners.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/runners.spec")["default"]>([], groupLayer);

/**
 * Registration tree consumed by the generated Convex entry point. Implement
 * handlers with `FunctionImpl.make` from `confect/_generated/server`. To invoke
 * a function, pass a leaf from `confect/_generated/refs` to a client or runner
 * rather than importing this tree.
 *
 * @internal
 */
export default {
["insertNoteViaRunner"]: RegisteredConvexFunction.register({ ...definitions["insertNoteViaRunner"], handler: forward(definitions["insertNoteViaRunner"].handler) }),
["getNumberViaRunner"]: RegisteredConvexFunction.register({ ...definitions["getNumberViaRunner"], handler: forward(definitions["getNumberViaRunner"].handler) }),
["countNotesViaRunner"]: RegisteredConvexFunction.register({ ...definitions["countNotesViaRunner"], handler: forward(definitions["countNotesViaRunner"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/runners.spec")["default"]>;
