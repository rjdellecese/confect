import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import cjsImporter from "../../../groups/cjsImporter.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../spec")["default"], "groups.cjsImporter">(databaseSchema, cjsImporter, RegisteredConvexFunction.make);
