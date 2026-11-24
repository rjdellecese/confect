/**
 * Registers Node actions in generated deployment modules. Implement actions
 * with `FunctionImpl.make` from `confect/_generated/server` rather than
 * importing this subpath.
 *
 * @module
 *
 * @internal
 */

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
import * as DatabaseSchema from "./DatabaseSchema";
import * as RegisteredFunction from "./RegisteredFunction";
import * as FunctionRegistryItem from "./FunctionRegistryItem";
import * as ResolvedMiddleware from "./ResolvedMiddleware";
import * as GroupRegistry from "./GroupRegistry";
import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as GroupImpl from "./GroupImpl";
import type * as Handler from "./Handler";
import type * as RegisteredFunctions from "./RegisteredFunctions";
import { mapLeaves } from "./internal/utils";

/**
 * Generated modules register a Node group's actions. Define the group with
 * `GroupSpec.makeNode()` and implement its actions with `FunctionImpl.make`
 * from `confect/_generated/server` instead of registering them directly.
 *
 * @internal
 */
export const buildForGroup = <Group extends GroupSpec.AnyWithProps>(
  groupLayer: Layer.Layer<GroupImpl.GroupImpl<"Finalized">>,
  target?: DatabaseSchema.Target,
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
            confect,
            ResolvedMiddleware.resolve(confect, middlewareRegistryItems),
            target,
          ),
        ),
        Match.exhaustive,
      ),
  ) as RegisteredFunctions.RegisteredFunctionsForGroupSpec<Group>;
};

/**
 * @internal
 */
export const make = (
  item: FunctionRegistryItem.ConfectFunctionRegistryItem,
  resolvedMiddlewares: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware> = [],
  target: DatabaseSchema.Target = DatabaseSchema.appTarget,
): RegisteredFunction.Any => {
  const genericFunction = Match.value(item.functionVisibility).pipe(
    Match.when("public", () => actionGeneric),
    Match.when("internal", () => internalActionGeneric),
    Match.exhaustive,
  );

  return genericFunction(
    RegisteredFunction.toConvexDefinition(
      nodeActionFunction({
        target: DatabaseSchema.checkedTarget(target),
        name: item.name,
        functionVisibility: item.functionVisibility,
        args: item.args,
        returns: item.returns,
        error: item.error,
        handler: item.handler,
        resolvedMiddlewares,
      }),
    ),
  );
};

const nodeActionFunction = <
  Args,
  ConvexArgs extends DefaultFunctionArgs,
  Returns,
  ConvexReturns,
  E,
>({
  target,
  name,
  functionVisibility,
  args,
  returns,
  error,
  handler,
  resolvedMiddlewares,
}: {
  target: DatabaseSchema.Target;
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
    | Handler.ActionServices<DatabaseSchema.AnyWithProps>
    | NodeServices.NodeServices
  >;
  resolvedMiddlewares: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware>;
}) =>
  RegisteredFunction.actionFunctionBase({
    scope: target.scope,
    name,
    functionVisibility,
    args,
    returns,
    error,
    handler,
    resolvedMiddlewares,
    createLayer: (ctx) =>
      Layer.mergeAll(
        RegisteredFunction.actionLayer(ctx, target),
        NodeServices.layer,
      ),
  });
