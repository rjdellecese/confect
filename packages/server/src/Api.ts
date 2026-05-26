import type { RuntimeAndFunctionType } from "@confect/core";
import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as Spec from "@confect/core/Spec";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import { defineSchema as defineConvexSchema } from "convex/server";
import { pipe, Predicate, Record } from "effect";
import type * as DatabaseSchema from "./DatabaseSchema";

export const TypeId = "@confect/server/Api";
export type TypeId = typeof TypeId;

export const isApi = (u: unknown): u is Any => Predicate.hasProperty(u, TypeId);

export interface Api<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Spec_ extends Spec.AnyWithProps,
> {
  readonly [TypeId]: TypeId;
  readonly spec: Spec_;
  readonly databaseSchema: DatabaseSchema_;
  readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends Api<
  DatabaseSchema.AnyWithProps,
  Spec.AnyWithProps
> {}

export interface AnyWithPropsWithRuntime<
  Runtime extends RuntimeAndFunctionType.Runtime,
> extends Api<
  DatabaseSchema.AnyWithProps,
  Spec.AnyWithPropsWithRuntime<Runtime>
> {}

export type Schema<Api_ extends AnyWithProps> = Api_["databaseSchema"];

export type GetSpec<Api_ extends AnyWithProps> = Api_["spec"];

export type Groups<Api_ extends AnyWithProps> = Spec.Groups<Api_["spec"]>;

const Proto = {
  [TypeId]: TypeId,
};

const makeProto = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Spec_ extends Spec.AnyWithProps,
>({
  databaseSchema,
  spec,
}: {
  databaseSchema: DatabaseSchema.AnyWithProps;
  spec: Spec_;
}): Api<DatabaseSchema_, Spec_> =>
  Object.assign(Object.create(Proto), {
    databaseSchema,
    spec,
    convexSchemaDefinition: pipe(
      databaseSchema.tables,
      Record.map(({ tableDefinition }) => tableDefinition),
      defineConvexSchema,
    ),
  });

export const make = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Spec_ extends Spec.AnyWithProps,
>(
  databaseSchema: DatabaseSchema_,
  spec: Spec_,
): Api<DatabaseSchema_, Spec_> => makeProto({ databaseSchema, spec });

/**
 * Resolve the dot-path of `group` within `api.spec` by reading the immutable
 * `paths` mapping that codegen populated in `_generated/spec.ts`. Throws when
 * the spec is not registered, with a message pointing the caller at the
 * place to register it.
 *
 * The legacy identity-based tree walk (`packages/server/src/GroupPath.ts`)
 * was deleted in favor of this O(1) map lookup; both the registration
 * mechanism (`Spec.addPath`) and the lookup key are the same JS reference
 * thanks to ES module dedup between `_generated/spec.ts` and `*.impl.ts`.
 */
export const resolveGroupPathUnsafe = (
  api: AnyWithProps,
  group: GroupSpec.AnyWithProps,
): string => {
  const groupPath = api.spec.paths.get(group);
  if (groupPath === undefined) {
    throw new Error(
      "GroupSpec has no registered path in this api's spec. " +
        "Ensure the spec is added via Spec.addPath in _generated/spec.ts " +
        "(or, in tests, call .addPath(spec, 'dot.path') on the Spec you pass to Api.make).",
    );
  }
  return groupPath;
};
