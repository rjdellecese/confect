import { RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../workpool.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../workpool.spec")["default"]>(databaseSchema, groupLayer);
