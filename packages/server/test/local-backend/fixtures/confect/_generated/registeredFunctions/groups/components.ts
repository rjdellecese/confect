import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import components from "../../../groups/components.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/components.spec")["default"]>(databaseSchema, components, RegisteredConvexFunction.make);
