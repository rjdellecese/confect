import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import counter from "../../counter.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../counter.spec")["default"]>(databaseSchema, counter, RegisteredConvexFunction.make);
