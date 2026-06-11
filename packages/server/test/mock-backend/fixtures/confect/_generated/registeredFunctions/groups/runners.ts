import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import runners from "../../../groups/runners.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/runners.spec")["default"]>(databaseSchema, runners, RegisteredConvexFunction.make);
