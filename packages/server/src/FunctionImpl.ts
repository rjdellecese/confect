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
 * Service that marks a named function in a group as implemented. A group's
 * layer requires one such service for each function in its spec.
 *
 * @category Services
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
 * Application-typed function builder exported as `FunctionImpl` by
 * `_generated/server`. Its handlers see the database services for the
 * application's schema.
 *
 * @remarks
 *   Codegen support: this interface names the generated builder shape; do not
 *   import it directly. Use `FunctionImpl.make` from
 *   `confect/_generated/server`; to name the builder's type, use `typeof
 *   FunctionImpl`.
 *
 * @category Models
 */
export interface Builder<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> {
  /**
   * Creates an implementation layer for one named function in a group spec.
   *
   * **Details**
   *
   * A Confect handler accepts decoded arguments and returns an Effect with the
   * spec's declared result and error types. It can use the services available
   * in its runtime and those provided by middleware attached to the group or
   * function.
   *
   * @category Layers
   *
   * @param group - Group declaration from the sibling `.spec.ts` module.
   * @param name - Name of the function to implement within the group.
   * @param handler - Effect handler for a Confect function, or the native
   *   registered function for a plain Convex function.
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
 * Binds the application's database type without loading its tables. Use
 * `FunctionImpl.make` from `confect/_generated/server` instead of binding the
 * builder directly.
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
   * Creates a function implementation layer without specializing its database
   * services to an application schema. Import `FunctionImpl` from
   * `_generated/server` to use its schema-typed `FunctionImpl.make` method with
   * the same arguments.
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
