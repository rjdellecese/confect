import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../../schema";
import transactions from "../../../groups/transactions.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../../groups/transactions.spec")["default"]>(databaseSchema, transactions, RegisteredConvexFunction.make);
