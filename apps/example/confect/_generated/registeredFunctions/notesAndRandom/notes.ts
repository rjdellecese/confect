import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import api from "../../api";
import notes from "../../../notesAndRandom/notes.impl";

export default RegisteredFunctions.buildForGroup(api, "notesAndRandom.notes", notes, RegisteredConvexFunction.make);
