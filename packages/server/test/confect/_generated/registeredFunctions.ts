import { RegisteredConvexFunction, RegisteredFunctions } from "@gunta/confect-server";
import impl from "../impl";

export default RegisteredFunctions.make(impl, RegisteredConvexFunction.make);
