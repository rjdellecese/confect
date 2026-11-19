import { RegisteredFunctions } from "@confect/server";
import groupLayer from "../../../groups/cacheControl.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/cacheControl.spec")["default"]>([], groupLayer);
