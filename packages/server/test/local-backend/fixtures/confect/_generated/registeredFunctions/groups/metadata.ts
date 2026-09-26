import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import metadata from "../../../groups/metadata.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/metadata.spec")["default"]>(databaseSchema, metadata, RegisteredConvexFunction.make);
