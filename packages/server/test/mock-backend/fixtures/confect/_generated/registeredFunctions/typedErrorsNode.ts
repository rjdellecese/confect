import { RegisteredNodeFunction } from "@confect/server/node";
import databaseSchema from "../schema";
import groupLayer from "../../typedErrorsNode.impl";

export default RegisteredNodeFunction.buildForGroup<typeof import("../../typedErrorsNode.spec")["default"]>(databaseSchema, groupLayer);
