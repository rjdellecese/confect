import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import impl from "../impl";

export default RegisteredFunctions.make(impl, RegisteredConvexFunction.make);
