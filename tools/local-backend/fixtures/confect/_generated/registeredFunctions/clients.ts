import { RegisteredFunctions } from "@confect/server";
import groupLayer from "../../clients.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../clients.spec")["default"]>([], groupLayer);
