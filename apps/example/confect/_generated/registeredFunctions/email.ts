import { RegisteredFunctions } from "@confect/server";
import { RegisteredNodeFunction } from "@confect/server/node";
import databaseSchema from "../schema";
import email from "../../email.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../email.spec")["default"]>(databaseSchema, email, RegisteredNodeFunction.make);
