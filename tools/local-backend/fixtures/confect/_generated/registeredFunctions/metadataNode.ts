import { RegisteredNodeFunction } from "@confect/server/node";
import groupLayer from "../../metadataNode.impl";

export default RegisteredNodeFunction.buildForGroup<typeof import("../../metadataNode.spec")["default"]>(groupLayer);
