import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import env from "../../env.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../env.spec")["default"]>(databaseSchema, env, RegisteredConvexFunction.make);
