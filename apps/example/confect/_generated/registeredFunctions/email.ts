import { RegisteredFunctions } from "@confect/server";
import { RegisteredNodeFunction } from "@confect/server/node";
import api from "../nodeApi";
import email from "../../node/email.impl";

export default RegisteredFunctions.buildForGroup(api, "email", email, RegisteredNodeFunction.make);
