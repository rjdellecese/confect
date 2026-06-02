import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import random from "../../../notes_and_random/random.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../notes_and_random/random.spec")["default"]>(databaseSchema, random, RegisteredConvexFunction.make);
