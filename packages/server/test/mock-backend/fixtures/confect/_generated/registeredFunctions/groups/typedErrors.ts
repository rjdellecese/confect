import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import typedErrors from "../../../groups/typedErrors.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/typedErrors.spec")["default"]>(databaseSchema, typedErrors, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
