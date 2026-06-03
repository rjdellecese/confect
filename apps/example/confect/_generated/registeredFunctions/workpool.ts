import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import workpool from "../../workpool.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../workpool.spec")["default"]>(databaseSchema, workpool, RegisteredConvexFunction.make);
