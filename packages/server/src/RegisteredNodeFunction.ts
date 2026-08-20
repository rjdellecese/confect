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
import type * as RegistryItem from "./RegistryItem";

export const make = (
  databaseSchema: DatabaseSchema.AnyWithProps,
  item: RegistryItem.ConfectRegistryItem,
  resolvedMiddlewares: ReadonlyArray<RegistryItem.ResolvedMiddleware> = [],
): RegisteredFunction.Any => {
  const genericFunction = Match.value(item.functionVisibility).pipe(
    Match.when("public", () => actionGeneric),
    Match.when("internal", () => internalActionGeneric),
    Match.exhaustive,
  );

  return genericFunction(
    nodeActionFunction(databaseSchema, {
      functionName: item.name,
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
    functionName,
    functionVisibility,
    args,
    returns,
    error,
    handler,
    resolvedMiddlewares,
  }: {
    functionName: string;
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
    resolvedMiddlewares: ReadonlyArray<RegistryItem.ResolvedMiddleware>;
  },
) =>
  RegisteredFunction.actionFunctionBase({
    functionName,
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
