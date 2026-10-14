import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import notes from "../../../groups/notes.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/notes.spec")["default"]>(databaseSchema, notes, (schema, item, middlewares) => RegisteredConvexFunction.make(schema, item, middlewares, (handler) => (ctx, args) => handler(ctx, args)));
