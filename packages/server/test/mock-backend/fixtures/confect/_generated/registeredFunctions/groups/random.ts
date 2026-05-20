import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import api from "../../api";
import random from "../../../groups/random.impl";

export default RegisteredFunctions.buildForGroup(api, "groups.random", random, RegisteredConvexFunction.make);
