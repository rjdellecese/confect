import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import middlewareOrder from "../../../groups/middlewareOrder.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/middlewareOrder.spec")["default"]>(databaseSchema, middlewareOrder, RegisteredConvexFunction.make);
