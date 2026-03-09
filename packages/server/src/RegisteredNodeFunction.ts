import type * as FunctionSpec from "@confect/core/FunctionSpec";
import { NodeContext } from "@effect/platform-node";
import {
  actionGeneric,
  type DefaultFunctionArgs,
  internalActionGeneric,
} from "convex/server";
import type { Effect } from "effect";
import { Layer, Match, type Schema } from "effect";
import type * as Api from "./Api";
import type * as DatabaseSchema from "./DatabaseSchema";
import * as RegisteredFunction from "./RegisteredFunction";
import type * as RegistryItem from "./RegistryItem";

export const make = <Api_ extends Api.AnyWithPropsWithRuntime<"Node">>(
  api: Api_,
  { function_: anyFunction_, handler }: RegistryItem.AnyWithProps,
): RegisteredFunction.RegisteredFunction => {
  const function_ = anyFunction_ as FunctionSpec.AnyConfect;

  const genericFunction = Match.value(function_.functionVisibility).pipe(
    Match.when("public", () => actionGeneric),
    Match.when("internal", () => internalActionGeneric),
    Match.exhaustive,
  );

  return genericFunction(
    nodeActionFunction(api.databaseSchema, {
      args: function_.functionProvenance.args,
      returns: function_.functionProvenance.returns,
      handler,
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
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<Args, ConvexArgs>;
    returns: Schema.Schema<Returns, ConvexReturns>;
    handler: (
      a: Args,
    ) => Effect.Effect<
      Returns,
      E,
      | RegisteredFunction.ActionServices<DatabaseSchema_>
      | NodeContext.NodeContext
    >;
  },
) =>
  RegisteredFunction.actionFunctionBase({
    args,
    returns,
    handler,
    createLayer: (ctx) =>
      Layer.mergeAll(
        RegisteredFunction.actionLayer(databaseSchema, ctx),
        NodeContext.layer,
      ),
  });
