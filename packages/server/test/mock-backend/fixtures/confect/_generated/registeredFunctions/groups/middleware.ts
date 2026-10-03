import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import middleware from "../../../groups/middleware.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/middleware.spec")["default"]>(databaseSchema, middleware, RegisteredConvexFunction.make);
