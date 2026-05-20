import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import api from "../../api";
import notes from "../../../groups/notes.impl";

export default RegisteredFunctions.buildForGroup(api, "groups.notes", notes, RegisteredConvexFunction.make);
