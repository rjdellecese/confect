import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import users from "../../users.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../users.spec")["default"]>(databaseSchema, users, RegisteredConvexFunction.make);
