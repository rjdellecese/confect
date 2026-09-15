import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import nativeComponents from "../../../groups/nativeComponents.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/nativeComponents.spec")["default"]>(databaseSchema, nativeComponents, RegisteredConvexFunction.make);
