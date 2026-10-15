import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import random from "../../../notes_and_random/random.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../notes_and_random/random.spec")["default"]>(databaseSchema, random);

export default {
["getNumber"]: RegisteredConvexFunction.register({ ...definitions["getNumber"], handler: forward(definitions["getNumber"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../notes_and_random/random.spec")["default"]>;
