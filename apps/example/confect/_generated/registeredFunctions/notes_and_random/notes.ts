import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import api from "../../api";
import notes from "../../../notes_and_random/notes.impl";

export default RegisteredFunctions.buildForGroup(api, "notes_and_random.notes", notes, RegisteredConvexFunction.make);
