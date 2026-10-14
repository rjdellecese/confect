import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import cacheStubbed from "../../../groups/cacheStubbed.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/cacheStubbed.spec")["default"]>(databaseSchema, cacheStubbed, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
