import type { GenericSchema, SchemaDefinition } from "convex/server";
import { defineSchema as defineConvexSchema } from "convex/server";
import { pipe, Predicate, Record } from "effect";
import type * as Spec from "@confect/core/Spec";
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
  readonly databaseSchema: DatabaseSchema_;
  readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends Any {
  readonly spec: Spec.AnyWithProps;
  readonly databaseSchema: DatabaseSchema.AnyWithProps;
  readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
}

export type Schema<Api_ extends AnyWithProps> = Api_["databaseSchema"];

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
