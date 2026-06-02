import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import random from "../../../groups/random.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../spec")["default"], "groups.random">(databaseSchema, random, RegisteredConvexFunction.make);
