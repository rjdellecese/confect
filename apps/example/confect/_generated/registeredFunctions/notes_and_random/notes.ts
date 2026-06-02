import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import notes from "../../../notes_and_random/notes.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../spec")["default"], "notes_and_random.notes">(databaseSchema, notes, RegisteredConvexFunction.make);
