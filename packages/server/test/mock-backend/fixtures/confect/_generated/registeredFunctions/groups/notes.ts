import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import notes from "../../../groups/notes.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/notes.spec")["default"]>(databaseSchema, notes, RegisteredConvexFunction.make);
