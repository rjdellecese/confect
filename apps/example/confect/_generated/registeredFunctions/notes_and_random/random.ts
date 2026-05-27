import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import api from "../../api";
import random from "../../../notes_and_random/random.impl";

export default RegisteredFunctions.buildForGroup(api, "notes_and_random.random", random, RegisteredConvexFunction.make);
