import type * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Record from "effect/Record";
import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as GroupImpl from "./GroupImpl";
import * as GroupRegistry from "./GroupRegistry";
import * as FunctionRegistryItem from "./FunctionRegistryItem";
import * as RegisteredConvexFunction from "./RegisteredConvexFunction";
import type * as RegisteredFunctions from "./RegisteredFunctions";
import * as ResolvedMiddleware from "./ResolvedMiddleware";
import { mapLeaves } from "./internal/utils";

export interface Definitions {
  readonly [name: string]: RegisteredConvexFunction.Definition | Definitions;
}

type DefinitionTag<
  Function extends FunctionSpec.AnyWithProps,
  Provenance = Function["functionProvenance"],
> = Provenance extends { readonly _tag: "Convex" }
  ? "Registered"
  : `${Capitalize<Function["functionVisibility"]>}${Capitalize<Function["runtimeAndFunctionType"]["functionType"]>}`;

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

export const register = <Group extends GroupSpec.AnyWithProps>(
  definitions: Definitions,
): RegisteredFunctions.RegisteredFunctionsForGroupSpec<Group> =>
  registerDefinitions(
    definitions,
  ) as RegisteredFunctions.RegisteredFunctionsForGroupSpec<Group>;

export const buildForGroup = <Group extends GroupSpec.AnyWithProps>(
  databaseSchema: DatabaseSchema.AnyWithProps,
  groupLayer: Layer.Layer<GroupImpl.GroupImpl<"Finalized">>,
): ForGroup<Group> => {
  const { functionRegistryItems, middlewareRegistryItems } =
    GroupRegistry.make(groupLayer);
  return mapLeaves<
    FunctionRegistryItem.AnyWithProps,
    RegisteredConvexFunction.Definition
  >(
    functionRegistryItems as {
      [key: string]: FunctionRegistryItem.AnyWithProps;
    },
    FunctionRegistryItem.isFunctionRegistryItem,
    (item) =>
      Match.value(item).pipe(
        Match.tag("Convex", ({ handler }) =>
          RegisteredConvexFunction.Definition.Registered({ handler }),
        ),
        Match.tag("Confect", (confect) =>
          RegisteredConvexFunction.prepare(
            databaseSchema,
            confect,
            ResolvedMiddleware.resolve(confect, middlewareRegistryItems),
          ),
        ),
        Match.exhaustive,
      ),
  ) as ForGroup<Group>;
};
