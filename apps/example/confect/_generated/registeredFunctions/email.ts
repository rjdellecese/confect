import { RegisteredFunctions } from "@confect/server";
import { RegisteredNodeFunction } from "@confect/server/node";
import databaseSchema from "../schema";
import email from "../../node/email.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../nodeSpec")["default"], "email">(databaseSchema, email, RegisteredNodeFunction.make);
