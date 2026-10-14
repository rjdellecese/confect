import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import transactions from "../../../groups/transactions.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/transactions.spec")["default"]>(databaseSchema, transactions, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
