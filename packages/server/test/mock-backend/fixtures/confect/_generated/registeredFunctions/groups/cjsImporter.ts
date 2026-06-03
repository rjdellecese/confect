import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import cjsImporter from "../../../groups/cjsImporter.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/cjsImporter.spec")["default"]>(databaseSchema, cjsImporter, RegisteredConvexFunction.make);
