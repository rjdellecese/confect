import { RegisteredFunctions } from "@confect/server";
import { RegisteredNodeFunction } from "@confect/server/node";
import api from "../nodeApi";
import typedErrorsNode from "../../node/typedErrorsNode.impl";

export default RegisteredFunctions.buildForGroup(api, "typedErrorsNode", typedErrorsNode, RegisteredNodeFunction.make);
