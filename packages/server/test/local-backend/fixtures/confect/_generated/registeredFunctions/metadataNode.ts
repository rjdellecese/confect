import { RegisteredNodeFunction } from "@confect/server/node";
import databaseSchema from "../schema";
import metadataNode from "../../metadataNode.impl";

export default RegisteredNodeFunction.buildForGroup<typeof import("../../metadataNode.spec")["default"]>(databaseSchema, metadataNode);
