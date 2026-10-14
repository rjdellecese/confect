import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import viewer from "../../viewer.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../viewer.spec")["default"]>(databaseSchema, viewer, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
