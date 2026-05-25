import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import api from "../../api";
import runners from "../../../groups/runners.impl";

export default RegisteredFunctions.buildForGroup(api, "groups.runners", runners, RegisteredConvexFunction.make);
