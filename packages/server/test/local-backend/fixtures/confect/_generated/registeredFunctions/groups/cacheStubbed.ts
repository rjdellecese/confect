import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import cacheStubbed from "../../../groups/cacheStubbed.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../spec")["default"], "groups.cacheStubbed">(databaseSchema, cacheStubbed, RegisteredConvexFunction.make);
