import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import api from "../api";
import databaseReader from "../../databaseReader.impl";

export default RegisteredFunctions.buildForGroup(api, "databaseReader", databaseReader, RegisteredConvexFunction.make);
