import type * as FunctionSpec from "@confect/core/FunctionSpec";
import { NodeContext } from "@effect/platform-node";
import {
  actionGeneric,
  type DefaultFunctionArgs,
  internalActionGeneric,
} from "convex/server";
import type { Effect } from "effect";
import { Layer, Match, type Schema } from "effect";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as Handler from "./Handler";
import * as RegisteredFunction from "./RegisteredFunction";
import type * as RegistryItem from "./RegistryItem";

/**
 * Shared, validator-free core for the Node-runtime action builders. `make`
 * accepts an optional {@link RegisteredFunction.Compilers}; when omitted the
 * action is registered with only a `handler` (no Convex `args`/`returns`
 * validators). This module does NOT import `SchemaToValidator`, so the
 * validator-free builder (`RegisteredNodeFunctionWithoutValidators`) keeps it
 * out of the function's startup import graph; the compiling builder
 * (`RegisteredNodeFunction`) injects the compilers.
 */
export const make = (
  databaseSchema: DatabaseSchema.AnyWithProps,
  { functionSpec, handler }: RegistryItem.AnyWithProps,
  compilers?: RegisteredFunction.Compilers,
): RegisteredFunction.Any =>
  Match.value(functionSpec.functionProvenance).pipe(
    Match.tag("Convex", () => handler as RegisteredFunction.Any),
    Match.tag("Confect", () => {
      const { functionVisibility, functionProvenance } =
        functionSpec as FunctionSpec.AnyConfect;

      const genericFunction = Match.value(functionVisibility).pipe(
        Match.when("public", () => actionGeneric),
        Match.when("internal", () => internalActionGeneric),
        Match.exhaustive,
      );

      return genericFunction(
        nodeActionFunction(
          databaseSchema,
          {
            args: functionProvenance.args,
            returns: functionProvenance.returns,
            error: functionProvenance.error,
            handler: handler as Handler.AnyConfectProvenance,
          },
          compilers,
        ),
      );
    }),
    Match.exhaustive,
  );

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
    error,
    handler,
  }: {
    args: Schema.Schema<Args, ConvexArgs>;
    returns: Schema.Schema<Returns, ConvexReturns>;
    error: Schema.Schema.AnyNoContext | undefined;
    handler: (
      a: Args,
    ) => Effect.Effect<
      Returns,
      E,
      | RegisteredFunction.ActionServices<DatabaseSchema_>
      | NodeContext.NodeContext
    >;
  },
  compilers?: RegisteredFunction.Compilers,
) => {
  const base = RegisteredFunction.actionFunctionBase({
    args,
    returns,
    error,
    handler,
    createLayer: (ctx) =>
      Layer.mergeAll(
        RegisteredFunction.actionLayer(databaseSchema, ctx),
        NodeContext.layer,
      ),
  });

  return compilers === undefined
    ? base
    : {
        ...base,
        args: compilers.compileArgs(args),
        returns: compilers.compileReturns(returns),
      };
};
