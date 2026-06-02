import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import runners from "../../../groups/runners.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../spec")["default"], "groups.runners">(databaseSchema, runners, RegisteredConvexFunction.make);
