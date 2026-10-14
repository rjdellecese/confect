import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import workpool from "../../workpool.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../workpool.spec")["default"]>(databaseSchema, workpool, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
