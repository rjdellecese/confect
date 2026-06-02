import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import random from "../../../groups/random.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/random.spec")["default"]>(databaseSchema, random, RegisteredConvexFunction.make);
