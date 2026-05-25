import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import api from "../api";
import workpool from "../../workpool.impl";

export default RegisteredFunctions.buildForGroup(api, "workpool", workpool, RegisteredConvexFunction.make);
