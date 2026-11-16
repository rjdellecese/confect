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
 * The schema-typed `FunctionImpl` builder exported by `_generated/server`.
 *
 * @category Models
 */
export interface Builder<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> {
  /**
   * Implement one function declared by a group spec.
   *
   * @category Layers
   *
   * @param group - The spec from the sibling `.spec.ts` module.
   * @param name - The function's name within that group.
   * @param handler - For a Confect function, accept decoded arguments and
   *   return an Effect with the declared result and error types. The handler
   *   can use its runtime's services and services supplied by group or function
   *   middleware. For a plain Convex function, pass its native registered
   *   function instead.
   *
   * @returns A layer to provide to `GroupImpl.make(group)` before finalization.
   */
  readonly make: <
    Group extends GroupSpec.AnyWithProps,
    const Name_ extends FunctionSpec.Name<GroupSpec.Functions<Group>>,
  >(
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
  ) => Layer.Layer<FunctionImpl<Name_>>;
}

/**
 * Bind the application's data model without loading any of its table modules.
 *
 * @internal
 */
export const forSchema = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
>(): Builder<DatabaseSchema_> => ({
  make: (group, name, handler) => {
    const functionSpec = group.functions[name]!;

    return Layer.effect(
      FunctionImpl({ name }),
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
  },
});

export const {
  /**
   * Implement a group function without specializing its database services. In
   * an application, import `FunctionImpl` from `_generated/server` to use the
   * {@link Builder.make | schema-typed builder} with the same arguments.
   *
   * @category Layers
   */
  make,
} = forSchema<DatabaseSchema.AnyWithProps>();

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
