import type * as FunctionSpec from "@confect/core/FunctionSpec";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  actionGeneric,
  type DefaultFunctionArgs,
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
  { functionSpec, handler }: RegistryItem.ConfectRegistryItem,
  middlewares: ReadonlyArray<RegistryItem.ResolvedMiddleware> = [],
): RegisteredFunction.Any => {
  const { functionVisibility, functionProvenance } = functionSpec;

  const genericFunction = Match.value(functionVisibility).pipe(
    Match.when("public", () => actionGeneric),
    Match.when("internal", () => internalActionGeneric),
    Match.exhaustive,
  );

  return genericFunction(
    nodeActionFunction(databaseSchema, {
      functionSpec,
      args: functionProvenance.args,
      returns: functionProvenance.returns,
      error: functionProvenance.error,
      handler,
      middlewares,
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
    functionSpec,
    args,
    returns,
    error,
    handler,
    middlewares,
  }: {
    functionSpec: FunctionSpec.AnyWithProps;
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
    middlewares: ReadonlyArray<RegistryItem.ResolvedMiddleware>;
  },
) =>
  RegisteredFunction.actionFunctionBase({
    functionSpec,
    args,
    returns,
    error,
    handler,
    middlewares,
    createLayer: (ctx) =>
      Layer.mergeAll(
        RegisteredFunction.actionLayer(databaseSchema, ctx),
        NodeServices.layer,
      ),
  });
