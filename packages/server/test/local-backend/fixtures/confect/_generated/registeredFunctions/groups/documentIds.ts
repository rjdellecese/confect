import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import documentIds from "../../../groups/documentIds.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/documentIds.spec")["default"]>(databaseSchema, documentIds, RegisteredConvexFunction.make);
