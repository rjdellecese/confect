import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import api from "../api";
import env from "../../env.impl";

export default RegisteredFunctions.buildForGroup(api, "env", env, RegisteredConvexFunction.make);
