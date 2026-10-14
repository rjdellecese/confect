import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import databaseReader from "../../databaseReader.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../databaseReader.spec")["default"]>(databaseSchema, databaseReader, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
