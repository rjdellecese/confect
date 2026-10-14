import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import middlewareOrder from "../../../groups/middlewareOrder.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/middlewareOrder.spec")["default"]>(databaseSchema, middlewareOrder, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
