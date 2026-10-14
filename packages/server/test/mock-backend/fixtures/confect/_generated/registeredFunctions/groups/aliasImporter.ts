import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import aliasImporter from "../../../groups/aliasImporter.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/aliasImporter.spec")["default"]>(databaseSchema, aliasImporter, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
