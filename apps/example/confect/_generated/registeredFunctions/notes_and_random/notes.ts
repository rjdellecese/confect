import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import notes from "../../../notes_and_random/notes.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../notes_and_random/notes.spec")["default"]>(databaseSchema, notes, RegisteredConvexFunction.make);
