import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import cacheStubbed from "../../../groups/cacheStubbed.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/cacheStubbed.spec")["default"]>(databaseSchema, cacheStubbed, RegisteredConvexFunction.make);
