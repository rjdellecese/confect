import { RegisteredFunctions } from "@confect/server";
import { RegisteredNodeFunction } from "@confect/server/node";
import databaseSchema from "../schema";
import metadataNode from "../../metadataNode.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../metadataNode.spec")["default"]>(databaseSchema, metadataNode, RegisteredNodeFunction.make);
