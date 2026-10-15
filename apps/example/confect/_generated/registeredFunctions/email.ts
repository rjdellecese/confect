import { RegisteredNodeFunction } from "@confect/server/node";
import databaseSchema from "../schema";
import groupLayer from "../../email.impl";

export default RegisteredNodeFunction.buildForGroup<typeof import("../../email.spec")["default"]>(databaseSchema, groupLayer);
