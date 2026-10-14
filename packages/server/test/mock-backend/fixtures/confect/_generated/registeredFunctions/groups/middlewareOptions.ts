import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import middlewareOptions from "../../../groups/middlewareOptions.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/middlewareOptions.spec")["default"]>(databaseSchema, middlewareOptions, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
