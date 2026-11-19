import { RegisteredNodeFunction } from "@confect/server/node";
import groupLayer from "../../typedErrorsNode.impl";

export default RegisteredNodeFunction.buildForGroup<typeof import("../../typedErrorsNode.spec")["default"]>(groupLayer);
