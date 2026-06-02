import { RegisteredFunctions } from "@confect/server";
import { RegisteredNodeFunction } from "@confect/server/node";
import databaseSchema from "../schema";
import typedErrorsNode from "../../node/typedErrorsNode.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../node/typedErrorsNode.spec")["default"]>(databaseSchema, typedErrorsNode, RegisteredNodeFunction.make);
