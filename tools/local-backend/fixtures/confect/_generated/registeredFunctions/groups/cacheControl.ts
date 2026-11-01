import { RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import groupLayer from "../../../groups/cacheControl.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/cacheControl.spec")["default"]>(databaseSchema, groupLayer);
