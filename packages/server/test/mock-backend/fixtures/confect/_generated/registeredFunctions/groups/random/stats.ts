import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../../schema";
import stats from "../../../../groups/random/stats.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../../groups/random/stats.spec")["default"]>(databaseSchema, stats, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
