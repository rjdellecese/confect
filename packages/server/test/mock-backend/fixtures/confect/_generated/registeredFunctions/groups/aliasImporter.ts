import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import api from "../../api";
import aliasImporter from "../../../groups/aliasImporter.impl";

export default RegisteredFunctions.buildForGroup(api, "groups.aliasImporter", aliasImporter, RegisteredConvexFunction.make);
