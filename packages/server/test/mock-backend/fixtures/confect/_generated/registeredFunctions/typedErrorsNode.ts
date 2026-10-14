import { RegisteredNodeFunction } from "@confect/server/node";
import databaseSchema from "../schema";
import typedErrorsNode from "../../typedErrorsNode.impl";

export default RegisteredNodeFunction.buildForGroup<typeof import("../../typedErrorsNode.spec")["default"]>(databaseSchema, typedErrorsNode);
