import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import cacheControl from "../../../groups/cacheControl.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../spec")["default"], "groups.cacheControl">(databaseSchema, cacheControl, RegisteredConvexFunction.make);
