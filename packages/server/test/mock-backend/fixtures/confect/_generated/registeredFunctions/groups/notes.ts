import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import notes from "../../../groups/notes.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../spec")["default"], "groups.notes">(databaseSchema, notes, RegisteredConvexFunction.make);
