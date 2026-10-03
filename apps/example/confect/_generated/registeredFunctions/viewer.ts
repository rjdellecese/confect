import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import viewer from "../../viewer.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../viewer.spec")["default"]>(databaseSchema, viewer, RegisteredConvexFunction.make);
