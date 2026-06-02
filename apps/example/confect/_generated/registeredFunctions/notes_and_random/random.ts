import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import random from "../../../notes_and_random/random.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../spec")["default"], "notes_and_random.random">(databaseSchema, random, RegisteredConvexFunction.make);
