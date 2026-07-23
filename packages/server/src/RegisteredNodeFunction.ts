import type * as FunctionSpec from "@confect/core/FunctionSpec";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  actionGeneric,
  type DefaultFunctionArgs,
  internalActionGeneric,
} from "convex/server";
import type { Schema } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as Handler from "./Handler";
import * as RegisteredFunction from "./RegisteredFunction";
import type * as RegistryItem from "./RegistryItem";
import type * as SchemaToValidator from "./SchemaToValidator";

export const make = (
  databaseSchema: DatabaseSchema.AnyWithProps,
  { functionSpec, handler }: RegistryItem.AnyWithProps,
): Effect.Effect<RegisteredFunction.Any, SchemaToValidator.CompileError> =>
  Match.value(functionSpec.functionProvenance).pipe(
    Match.tag("Convex", () =>
      Effect.succeed(handler as RegisteredFunction.Any),
    ),
    Match.tag("Confect", () => {
      const { functionVisibility, functionProvenance } =
        functionSpec as FunctionSpec.AnyConfect;

      const genericFunction = Match.value(functionVisibility).pipe(
        Match.when("public", () => actionGeneric),
        Match.when("internal", () => internalActionGeneric),
        Match.exhaustive,
      );

      return Effect.map(
        nodeActionFunction(databaseSchema, {
          args: functionProvenance.args,
          returns: functionProvenance.returns,
          error: functionProvenance.error,
          handler: handler as Handler.AnyConfectProvenance,
        }),
        (definition) => genericFunction(definition),
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
  },
) =>
  RegisteredFunction.actionFunctionBase({
    args,
    returns,
    error,
    handler,
    createLayer: (ctx) =>
      Layer.mergeAll(
        RegisteredFunction.actionLayer(databaseSchema, ctx),
        NodeServices.layer,
      ),
  });
