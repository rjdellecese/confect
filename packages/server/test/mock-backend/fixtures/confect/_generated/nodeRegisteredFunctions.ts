import { RegisteredFunctions } from "@confect/server";
import { RegisteredNodeFunction } from "@confect/server/node";

import nodeImpl from "../nodeImpl";

export default RegisteredFunctions.make(nodeImpl, RegisteredNodeFunction.make);
