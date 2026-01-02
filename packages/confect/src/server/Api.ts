import type { GenericSchema, SchemaDefinition } from "convex/server";
import { defineSchema as defineConvexSchema } from "convex/server";
import { pipe, Predicate, Record } from "effect";
import type * as Spec from "../api/Spec";
import type * as DatabaseSchema from "./DatabaseSchema";

export const TypeId = "@rjdellecese/confect/server/Api";
export type TypeId = typeof TypeId;

export const isApi = (u: unknown): u is Any => Predicate.hasProperty(u, TypeId);

export interface Api<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Spec_ extends Spec.AnyWithProps,
> {
  readonly [TypeId]: TypeId;
  readonly spec: Spec_;
  // TODO: Rename to `databaseSchema`
  readonly schema: DatabaseSchema_;
  readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends Any {
  readonly spec: Spec.AnyWithProps;
  // TODO: Rename to `databaseSchema`
  readonly schema: DatabaseSchema.AnyWithProps;
  readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
}

export type Schema<Api_ extends AnyWithProps> = Api_["schema"];

export type Groups<Api_ extends AnyWithProps> = Spec.Groups<Api_["spec"]>;

const Proto = {
  [TypeId]: TypeId,
};

const makeProto = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Spec_ extends Spec.AnyWithProps,
>({
  // TODO: Rename to `databaseSchema`
  schema,
  spec,
}: {
  schema: DatabaseSchema.AnyWithProps;
  spec: Spec_;
}): Api<DatabaseSchema_, Spec_> =>
  Object.assign(Object.create(Proto), {
    schema,
    spec,
    convexSchemaDefinition: pipe(
      schema.tables,
      Record.map(({ tableDefinition }) => tableDefinition),
      defineConvexSchema,
    ),
  });

export const make = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Spec_ extends Spec.AnyWithProps,
>(
  schema: DatabaseSchema_,
  spec: Spec_,
): Api<DatabaseSchema_, Spec_> => makeProto({ schema, spec });
