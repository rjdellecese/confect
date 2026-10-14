import type * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as GroupImpl from "./GroupImpl";
import * as GroupRegistry from "./GroupRegistry";
import * as FunctionRegistryItem from "./FunctionRegistryItem";
import * as RegisteredConvexFunction from "./RegisteredConvexFunction";
import * as ResolvedMiddleware from "./ResolvedMiddleware";
import { mapLeaves } from "./internal/utils";

export interface Definitions {
  readonly [name: string]: RegisteredConvexFunction.Definition | Definitions;
}

export const isDefinition = (
  value: RegisteredConvexFunction.Definition | Definitions,
): value is RegisteredConvexFunction.Definition =>
  typeof value._tag === "string";

export const buildForGroup = (
  databaseSchema: DatabaseSchema.AnyWithProps,
  groupLayer: Layer.Layer<GroupImpl.GroupImpl<"Finalized">>,
): Definitions => {
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
  );
};
