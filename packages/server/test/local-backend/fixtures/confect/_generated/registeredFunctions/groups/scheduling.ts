import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import scheduling from "../../../groups/scheduling.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/scheduling.spec")["default"]>(databaseSchema, scheduling, RegisteredConvexFunction.make);
