import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import parent from "../../parent.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../parent.spec")["default"]>(databaseSchema, parent, RegisteredConvexFunction.make);
