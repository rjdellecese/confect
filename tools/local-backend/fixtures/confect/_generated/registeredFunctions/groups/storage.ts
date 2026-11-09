import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import groupLayer from "../../../groups/storage.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../../groups/storage.spec")["default"]>(databaseSchema, groupLayer);

export default {
["storeMutation"]: RegisteredConvexFunction.register({ ...definitions["storeMutation"], handler: forward(definitions["storeMutation"].handler) }),
["getMutation"]: RegisteredConvexFunction.register({ ...definitions["getMutation"], handler: forward(definitions["getMutation"].handler) }),
["deleteAndGet"]: RegisteredConvexFunction.register({ ...definitions["deleteAndGet"], handler: forward(definitions["deleteAndGet"].handler) }),
["replaceThenFail"]: RegisteredConvexFunction.register({ ...definitions["replaceThenFail"], handler: forward(definitions["replaceThenFail"].handler) }),
["rollback"]: RegisteredConvexFunction.register({ ...definitions["rollback"], handler: forward(definitions["rollback"].handler) }),
["pendingUrl"]: RegisteredConvexFunction.register({ ...definitions["pendingUrl"], handler: forward(definitions["pendingUrl"].handler) }),
["staleRead"]: RegisteredConvexFunction.register({ ...definitions["staleRead"], handler: forward(definitions["staleRead"].handler) }),
["exerciseFiles"]: RegisteredConvexFunction.register({ ...definitions["exerciseFiles"], handler: forward(definitions["exerciseFiles"].handler) }),
["limitedFiles"]: RegisteredConvexFunction.register({ ...definitions["limitedFiles"], handler: forward(definitions["limitedFiles"].handler) }),
["generateUploadUrl"]: RegisteredConvexFunction.register({ ...definitions["generateUploadUrl"], handler: forward(definitions["generateUploadUrl"].handler) }),
["getUrl"]: RegisteredConvexFunction.register({ ...definitions["getUrl"], handler: forward(definitions["getUrl"].handler) }),
["store"]: RegisteredConvexFunction.register({ ...definitions["store"], handler: forward(definitions["store"].handler) }),
["get"]: RegisteredConvexFunction.register({ ...definitions["get"], handler: forward(definitions["get"].handler) }),
["deleteBlob"]: RegisteredConvexFunction.register({ ...definitions["deleteBlob"], handler: forward(definitions["deleteBlob"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/storage.spec")["default"]>;
