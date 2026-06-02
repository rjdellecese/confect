import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import databaseReader from "../../databaseReader.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../spec")["default"], "databaseReader">(databaseSchema, databaseReader, RegisteredConvexFunction.make);
