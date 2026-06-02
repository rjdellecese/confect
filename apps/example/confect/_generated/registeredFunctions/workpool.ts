import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import workpool from "../../workpool.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../spec")["default"], "workpool">(databaseSchema, workpool, RegisteredConvexFunction.make);
