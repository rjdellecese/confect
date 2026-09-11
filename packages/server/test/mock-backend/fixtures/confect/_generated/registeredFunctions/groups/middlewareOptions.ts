import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import middlewareOptions from "../../../groups/middlewareOptions.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/middlewareOptions.spec")["default"]>(databaseSchema, middlewareOptions, RegisteredConvexFunction.make);
