/**
 * Prepares definitions for generated Convex registrations. Implement handlers
 * with `FunctionImpl.make` from `confect/_generated/server` rather than
 * importing this subpath.
 *
 * @module
 *
 * @internal
 */

import type * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Record from "effect/Record";
import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as GroupImpl from "./GroupImpl";
import * as GroupRegistry from "./GroupRegistry";
import * as FunctionRegistryItem from "./FunctionRegistryItem";
import * as RegisteredConvexFunction from "./RegisteredConvexFunction";
import type * as RegisteredFunctions from "./RegisteredFunctions";
import * as ResolvedMiddleware from "./ResolvedMiddleware";
import { mapLeaves } from "./internal/utils";

/**
 * @internal
 */
export interface Definitions {
  readonly [name: string]: RegisteredConvexFunction.Definition | Definitions;
}

type DefinitionTag<
  Function extends FunctionSpec.AnyWithProps,
  Provenance = Function["functionProvenance"],
> = Provenance extends { readonly _tag: "Convex" }
  ? "Registered"
  : `${Capitalize<Function["functionVisibility"]>}${Capitalize<Function["runtimeAndFunctionType"]["functionType"]>}`;

/**
 * @internal
 */
export type ForGroup<Group extends GroupSpec.AnyWithProps> = {
  readonly [Name in FunctionSpec.Name<GroupSpec.Functions<Group>>]: Extract<
    RegisteredConvexFunction.Definition,
    {
      readonly _tag: DefinitionTag<
        FunctionSpec.WithName<GroupSpec.Functions<Group>, Name>
      >;
    }
  >;
} & {
  readonly [Name in GroupSpec.Name<GroupSpec.Groups<Group>>]: ForGroup<
    GroupSpec.WithName<GroupSpec.Groups<Group>, Name>
  >;
};

/**
 * @internal
 */
export const isDefinition = (
  value: RegisteredConvexFunction.Definition | Definitions,
): value is RegisteredConvexFunction.Definition =>
  typeof value._tag === "string";

const registerDefinitions = (
  definitions: Definitions,
): RegisteredFunctions.AnyWithProps =>
  Record.map(definitions, (value) =>
    isDefinition(value)
      ? RegisteredConvexFunction.register(value)
      : registerDefinitions(value),
  );

/**
 * @internal
 */
export const register = <Group extends GroupSpec.AnyWithProps>(
  definitions: Definitions,
): RegisteredFunctions.RegisteredFunctionsForGroupSpec<Group> =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Generated exports retain each spec's visibility, arguments, and result; the recursive runtime walk preserves the names but TypeScript forgets them.
  registerDefinitions(
    definitions,
  ) as RegisteredFunctions.RegisteredFunctionsForGroupSpec<Group>;

/**
 * Generated deployment modules register each group's handlers. In `.impl.ts`
 * use `FunctionImpl.make` and `GroupImpl.finalize` from
 * `confect/_generated/server` rather than registering functions directly.
 *
 * @internal
 */
export const buildForGroup = <Group extends GroupSpec.AnyWithProps>(
  tableNames: ReadonlyArray<string>,
  groupLayer: Layer.Layer<GroupImpl.GroupImpl<"Finalized">>,
): ForGroup<Group> => {
  const { functionRegistryItems, middlewareRegistryItems } =
    GroupRegistry.make(groupLayer);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The finalized group's registry mirrors its spec; generated handlers require the exact mapped leaf types, not a dictionary of all function kinds.
  return mapLeaves<
    FunctionRegistryItem.AnyWithProps,
    RegisteredConvexFunction.Definition
  >(
    functionRegistryItems,
    FunctionRegistryItem.isFunctionRegistryItem,
    (item) =>
      Match.value(item).pipe(
        Match.tag("Convex", ({ handler }) =>
          RegisteredConvexFunction.Definition.Registered({ handler }),
        ),
        Match.tag("Confect", (confect) =>
          RegisteredConvexFunction.prepare(
            tableNames,
            confect,
            ResolvedMiddleware.resolve(confect, middlewareRegistryItems),
          ),
        ),
        Match.exhaustive,
      ),
  ) as ForGroup<Group>;
};
