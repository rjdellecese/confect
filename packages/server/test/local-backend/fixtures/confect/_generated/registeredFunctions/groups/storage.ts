import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import storage from "../../../groups/storage.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/storage.spec")["default"]>(databaseSchema, storage, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
