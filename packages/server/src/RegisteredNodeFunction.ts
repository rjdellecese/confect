import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  actionGeneric,
  type DefaultFunctionArgs,
  type FunctionVisibility,
  internalActionGeneric,
} from "convex/server";
import type { Effect } from "effect";
import type { Schema } from "effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import type * as DatabaseSchema from "./DatabaseSchema";
import * as RegisteredFunction from "./RegisteredFunction";
import * as FunctionRegistryItem from "./FunctionRegistryItem";
import * as ResolvedMiddleware from "./ResolvedMiddleware";
import * as GroupRegistry from "./GroupRegistry";
import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as GroupImpl from "./GroupImpl";
import type * as RegisteredFunctions from "./RegisteredFunctions";
import { mapLeaves } from "./internal/utils";

export const buildForGroup = <Group extends GroupSpec.AnyWithProps>(
  databaseSchema: DatabaseSchema.AnyWithProps,
  groupLayer: Layer.Layer<GroupImpl.GroupImpl<"Finalized">>,
): RegisteredFunctions.RegisteredFunctionsForGroupSpec<Group> => {
  const { functionRegistryItems, middlewareRegistryItems } =
    GroupRegistry.make(groupLayer);
  return mapLeaves<FunctionRegistryItem.AnyWithProps, RegisteredFunction.Any>(
    functionRegistryItems as {
      [key: string]: FunctionRegistryItem.AnyWithProps;
    },
    FunctionRegistryItem.isFunctionRegistryItem,
    (item) =>
      Match.value(item).pipe(
        Match.tag("Convex", ({ handler }) => handler),
        Match.tag("Confect", (confect) =>
          make(
            databaseSchema,
            confect,
            ResolvedMiddleware.resolve(confect, middlewareRegistryItems),
          ),
        ),
        Match.exhaustive,
      ),
  ) as RegisteredFunctions.RegisteredFunctionsForGroupSpec<Group>;
};

export const make = (
  databaseSchema: DatabaseSchema.AnyWithProps,
  item: FunctionRegistryItem.ConfectFunctionRegistryItem,
  resolvedMiddlewares: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware> = [],
): RegisteredFunction.Any => {
  const genericFunction = Match.value(item.functionVisibility).pipe(
    Match.when("public", () => actionGeneric),
    Match.when("internal", () => internalActionGeneric),
    Match.exhaustive,
  );

  return genericFunction(
    nodeActionFunction(databaseSchema, {
      name: item.name,
      functionVisibility: item.functionVisibility,
      args: item.args,
      returns: item.returns,
      error: item.error,
      handler: item.handler,
      resolvedMiddlewares,
    }),
  );
};

const nodeActionFunction = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Args,
  ConvexArgs extends DefaultFunctionArgs,
  Returns,
  ConvexReturns,
  E,
>(
  databaseSchema: DatabaseSchema_,
  {
    name,
    functionVisibility,
    args,
    returns,
    error,
    handler,
    resolvedMiddlewares,
  }: {
    name: string;
    functionVisibility: FunctionVisibility;
    args: Schema.Codec<Args, ConvexArgs>;
    returns: Schema.Codec<Returns, ConvexReturns>;
    error: Schema.Codec<any, any> | undefined;
    handler: (
      a: Args,
    ) => Effect.Effect<
      Returns,
      E,
      | RegisteredFunction.ActionServices<DatabaseSchema_>
      | NodeServices.NodeServices
    >;
    resolvedMiddlewares: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware>;
  },
) =>
  RegisteredFunction.actionFunctionBase({
    name,
    functionVisibility,
    args,
    returns,
    error,
    handler,
    resolvedMiddlewares,
    createLayer: (ctx) =>
      Layer.mergeAll(
        RegisteredFunction.actionLayer(databaseSchema, ctx),
        NodeServices.layer,
      ),
  });
