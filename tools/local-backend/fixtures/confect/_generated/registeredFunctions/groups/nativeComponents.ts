import { RegisteredFunctions } from "@confect/server";
import groupLayer from "../../../groups/nativeComponents.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/nativeComponents.spec")["default"]>([], groupLayer);
