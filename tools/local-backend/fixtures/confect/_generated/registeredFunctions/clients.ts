import { RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../clients.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../clients.spec")["default"]>(databaseSchema, groupLayer);
