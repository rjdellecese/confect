import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as GroupSpec from "@confect/core/GroupSpec";
import * as Registry from "@confect/core/Registry";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as Handler from "./Handler";
import { setNestedProperty } from "./internal/utils";
import * as RegistryItem from "./RegistryItem";

export interface FunctionImpl<FunctionName extends string> {
  readonly functionName: FunctionName;
}

export const FunctionImpl = <FunctionName extends string>({
  functionName,
}: {
  functionName: FunctionName;
}) =>
  Context.GenericTag<FunctionImpl<FunctionName>>(
    `@confect/server/FunctionImpl/${functionName}`,
  );

/**
 * Register a single function's implementation into the group's `Registry`.
 *
 * The function is registered under a flat, single-segment key (its own
 * `functionName`), not a project-wide dot-path. Each group's impl layer is
 * built in isolation — `RegisteredFunctions.buildForGroup` (and the CLI's
 * `validateImpl`) provide a fresh `Registry` per group — so function names
 * only need to be unique within their own group.
 *
 * `databaseSchema` is retained purely as a type-level carrier: the handler's
 * ctx-service requirements (`DatabaseReader`, `QueryCtx<DataModel>`, …) are
 * derived from it via `Handler.WithName`. It is not read at runtime — the
 * generated per-group registry forwards the schema value to the function
 * builders — so impls depend on `_generated/schema` (table schemas) rather than
 * `_generated/api` (which transitively imports every function spec).
 */
export const make = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Group extends GroupSpec.AnyWithProps,
  const FunctionName extends FunctionSpec.Name<GroupSpec.Functions<Group>>,
>(
  _databaseSchema: DatabaseSchema_,
  group: Group,
  functionName: FunctionName,
  handler: Handler.WithName<
    DatabaseSchema_,
    GroupSpec.Functions<Group>,
    FunctionName
  >,
): Layer.Layer<FunctionImpl<FunctionName>> => {
  const functionSpec = group.functions[functionName]!;

  return Layer.effect(
    FunctionImpl<FunctionName>({ functionName }),
    Effect.gen(function* () {
      const registry = yield* Registry.Registry;

      yield* Ref.update(registry, (registryItems) =>
        setNestedProperty(
          registryItems,
          [functionName],
          RegistryItem.make({
            functionSpec,
            handler,
          }),
        ),
      );

      return { functionName };
    }),
  );
};

/**
 * Get the function implementation service type for a specific function name.
 */
export type ForFunction<FunctionName extends string> =
  FunctionImpl<FunctionName>;

/**
 * Get all function implementation services required for a group spec.
 */
export type FromGroupSpec<Group extends GroupSpec.AnyWithProps> =
  FunctionSpec.Name<
    GroupSpec.Functions<Group>
  > extends infer FunctionNames extends string
    ? FunctionNames extends string
      ? FunctionImpl<FunctionNames>
      : never
    : never;
