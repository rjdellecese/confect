import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import middlewareHelpers from "../../../groups/middlewareHelpers.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/middlewareHelpers.spec")["default"]>(databaseSchema, middlewareHelpers, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
