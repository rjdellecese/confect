import { RegisteredFunctions } from "@confect/server";
import { RegisteredNodeFunction } from "@confect/server/node";
import databaseSchema from "../schema";
import typedErrorsNode from "../../typedErrorsNode.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../typedErrorsNode.spec")["default"]>(databaseSchema, typedErrorsNode, RegisteredNodeFunction.make);
