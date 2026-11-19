import { RegisteredNodeFunction } from "@confect/server/node";
import groupLayer from "../../email.impl";

export default RegisteredNodeFunction.buildForGroup<typeof import("../../email.spec")["default"]>(groupLayer);
