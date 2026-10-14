import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import { queryGeneric, internalQueryGeneric, mutationGeneric, internalMutationGeneric, actionGeneric, internalActionGeneric } from "convex/server";
import * as Record from "effect/Record";
import databaseSchema from "../../schema";
import transactions from "../../../groups/transactions.impl";

const register = (definitions: ConvexFunctionDefinitions.Definitions): RegisteredFunctions.AnyWithProps => Record.map(definitions, (value) =>
  ConvexFunctionDefinitions.isDefinition(value)
    ? RegisteredConvexFunction.Definition.$match(value, {
        PublicQuery: ({ definition }) => queryGeneric({ ...definition, handler: (ctx, args) => definition.handler(ctx, args) }),
        InternalQuery: ({ definition }) => internalQueryGeneric({ ...definition, handler: (ctx, args) => definition.handler(ctx, args) }),
        PublicMutation: ({ definition }) => mutationGeneric({ ...definition, handler: (ctx, args) => definition.handler(ctx, args) }),
        InternalMutation: ({ definition }) => internalMutationGeneric({ ...definition, handler: (ctx, args) => definition.handler(ctx, args) }),
        PublicAction: ({ definition }) => actionGeneric({ ...definition, handler: (ctx, args) => definition.handler(ctx, args) }),
        InternalAction: ({ definition }) => internalActionGeneric({ ...definition, handler: (ctx, args) => definition.handler(ctx, args) }),
        Registered: ({ handler }) => handler,
      })
    : register(value),
);

export default register(ConvexFunctionDefinitions.buildForGroup(databaseSchema, transactions)) as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../../groups/transactions.spec")["default"]>;
