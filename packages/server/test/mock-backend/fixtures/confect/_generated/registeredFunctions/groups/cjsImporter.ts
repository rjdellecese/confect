import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import cjsImporter from "../../../groups/cjsImporter.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/cjsImporter.spec")["default"]>(databaseSchema, cjsImporter, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
