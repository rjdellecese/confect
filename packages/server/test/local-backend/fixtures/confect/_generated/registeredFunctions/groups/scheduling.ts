import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import scheduling from "../../../groups/scheduling.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/scheduling.spec")["default"]>(databaseSchema, scheduling, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
