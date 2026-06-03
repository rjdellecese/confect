import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import databaseReader from "../../databaseReader.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../databaseReader.spec")["default"]>(databaseSchema, databaseReader, RegisteredConvexFunction.make);
