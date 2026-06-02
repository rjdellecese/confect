import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import aliasImporter from "../../../groups/aliasImporter.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../spec")["default"], "groups.aliasImporter">(databaseSchema, aliasImporter, RegisteredConvexFunction.make);
