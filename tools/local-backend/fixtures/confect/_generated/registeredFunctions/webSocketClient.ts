import { RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../webSocketClient.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../webSocketClient.spec")["default"]>(databaseSchema, groupLayer);
