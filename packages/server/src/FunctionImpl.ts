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

export interface FunctionImpl<Name_ extends string> {
  readonly name: Name_;
}

export const FunctionImpl = <Name_ extends string>({ name }: { name: Name_ }) =>
  Context.Service<FunctionImpl<Name_>>(`@confect/server/FunctionImpl/${name}`);

export interface Builder<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> {
  /**
   * Register a function in its group's isolated registry under its local name.
   * The function may require the services available in its runtime and those
   * provided by middleware attached to the group or the function.
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

export const { make } = forSchema<DatabaseSchema.AnyWithProps>();

/**
 * Get the function implementation service type for a specific function name.
 */
export type ForFunction<Name_ extends string> = FunctionImpl<Name_>;

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
