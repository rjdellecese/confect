import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import typedErrors from "../../../groups/typedErrors.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../spec")["default"], "groups.typedErrors">(databaseSchema, typedErrors, RegisteredConvexFunction.make);
