import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import api from "../../api";
import cacheControl from "../../../groups/cacheControl.impl";

export default RegisteredFunctions.buildForGroup(api, "groups.cacheControl", cacheControl, RegisteredConvexFunction.make);
