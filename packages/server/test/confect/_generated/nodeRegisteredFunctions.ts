import { RegisteredFunctions } from "@gunta/confect-server";
import { RegisteredNodeFunction } from "@gunta/confect-server/node";

import nodeImpl from "../nodeImpl";

export default RegisteredFunctions.make(nodeImpl, RegisteredNodeFunction.make);
