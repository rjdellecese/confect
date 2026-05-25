import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import api from "../../api";
import typedErrors from "../../../groups/typedErrors.impl";

export default RegisteredFunctions.buildForGroup(api, "groups.typedErrors", typedErrors, RegisteredConvexFunction.make);
