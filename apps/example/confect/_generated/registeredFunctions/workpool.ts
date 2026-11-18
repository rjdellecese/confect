import { RegisteredFunctions } from "@confect/server";
import groupLayer from "../../workpool.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../workpool.spec")["default"]>([], groupLayer);
