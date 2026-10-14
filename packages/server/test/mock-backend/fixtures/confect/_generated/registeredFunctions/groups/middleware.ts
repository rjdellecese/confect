import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import middleware from "../../../groups/middleware.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/middleware.spec")["default"]>(databaseSchema, middleware, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
