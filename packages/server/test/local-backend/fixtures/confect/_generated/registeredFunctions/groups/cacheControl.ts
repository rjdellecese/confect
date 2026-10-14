import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import cacheControl from "../../../groups/cacheControl.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/cacheControl.spec")["default"]>(databaseSchema, cacheControl, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
