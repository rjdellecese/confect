import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import api from "../../api";
import cacheStubbed from "../../../groups/cacheStubbed.impl";

export default RegisteredFunctions.buildForGroup(api, "groups.cacheStubbed", cacheStubbed, RegisteredConvexFunction.make);
