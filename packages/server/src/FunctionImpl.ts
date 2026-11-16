import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as Registry from "./Registry";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as Handler from "./Handler";
import { setNestedProperty } from "./internal/utils";
import * as FunctionRegistryItem from "./FunctionRegistryItem";

/**
 * Service provided by a function implementation layer, keyed by its spec name.
 *
 * @category Models
 */
export interface FunctionImpl<Name_ extends string> {
  /**
   * Name of the implemented function within its group.
   *
   * @category Models
   */
  readonly name: Name_;
}

/**
 * @internal
 */
export const FunctionImpl = <Name_ extends string>({ name }: { name: Name_ }) =>
  Context.Service<FunctionImpl<Name_>>(`@confect/server/FunctionImpl/${name}`);

/**
 * Implement one function declared by a group spec.
 *
 * @category Layers
 *
 * @param _databaseSchema - Generated runtime schema, not convexSchema. It
 *   carries service types without evaluating table schemas during
 *   construction.
 * @param group - Group spec containing the named function.
 * @param name - Function's local name within the group.
 * @param handler - For a Confect spec, a function from decoded args to an
 *   Effect returning the declared result and failing only with declared errors.
 *   It may use generated context services and middleware-provided services. For
 *   a plain Convex spec, supply the corresponding native registered function
 *   instead.
 *
 * @returns A layer to provide to GroupImpl.make before finalizing the group.
 */
export const make = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Group extends GroupSpec.AnyWithProps,
  const Name_ extends FunctionSpec.Name<GroupSpec.Functions<Group>>,
>(
  _databaseSchema: DatabaseSchema_,
  group: Group,
  name: Name_,
  handler: Handler.WithName<
    DatabaseSchema_,
    GroupSpec.Functions<Group>,
    Name_,
    MiddlewareSpec.Provides<
      | GroupSpec.MiddlewareSpecs<Group>
      | FunctionSpec.MiddlewareSpecs<
          FunctionSpec.WithName<GroupSpec.Functions<Group>, Name_>
        >
    >
  >,
): Layer.Layer<FunctionImpl<Name_>> => {
  const functionSpec = group.functions[name]!;

  return Layer.effect(
    FunctionImpl<Name_>({ name }),
    Effect.gen(function* () {
      const registry = yield* Registry.Registry;

      yield* Ref.update(registry, (registryItems) =>
        setNestedProperty(
          registryItems,
          [name],
          FunctionRegistryItem.make({
            functionSpec,
            groupMiddlewareAttachments: group.middlewareAttachments,
            handler,
          }),
        ),
      );

      return { name };
    }),
  );
};

/**
 * Get the function implementation service type for a specific function name.
 *
 * @internal
 */
export type ForFunction<Name_ extends string> = FunctionImpl<Name_>;

/**
 * Get all function implementation services required for a group spec.
 *
 * @internal
 */
export type FromGroupSpec<Group extends GroupSpec.AnyWithProps> =
  FunctionSpec.Name<
    GroupSpec.Functions<Group>
  > extends infer FunctionNames extends string
    ? FunctionNames extends string
      ? FunctionImpl<FunctionNames>
      : never
    : never;
