import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import api from "../../api";
import random from "../../../notesAndRandom/random.impl";

export default RegisteredFunctions.buildForGroup(api, "notesAndRandom.random", random, RegisteredConvexFunction.make);
