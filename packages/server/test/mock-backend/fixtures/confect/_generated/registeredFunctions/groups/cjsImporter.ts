import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import api from "../../api";
import cjsImporter from "../../../groups/cjsImporter.impl";

export default RegisteredFunctions.buildForGroup(api, "groups.cjsImporter", cjsImporter, RegisteredConvexFunction.make);
