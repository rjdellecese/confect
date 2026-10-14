import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import metadata from "../../../groups/metadata.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/metadata.spec")["default"]>(databaseSchema, metadata, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
