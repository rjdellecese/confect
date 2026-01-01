import type { GenericSchema, SchemaDefinition } from "convex/server";
import { defineSchema as defineConvexSchema } from "convex/server";
import { pipe, Predicate, Record } from "effect";
import type * as Spec from "../api/Spec";
import type * as DatabaseSchema from "./DatabaseSchema";

export const TypeId = "@rjdellecese/confect/server/Api";
export type TypeId = typeof TypeId;

export const isApi = (u: unknown): u is Api.Any =>
  Predicate.hasProperty(u, TypeId);

export interface Api<
  Schema_ extends DatabaseSchema.DatabaseSchema.AnyWithProps,
  Spec_ extends Spec.Spec.AnyWithProps,
> {
  readonly [TypeId]: TypeId;
  readonly spec: Spec_;
  readonly schema: Schema_;
  readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
}

export declare namespace Api {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps extends Any {
    readonly spec: Spec.Spec.AnyWithProps;
    readonly schema: DatabaseSchema.DatabaseSchema.AnyWithProps;
    readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
  }

  export type Schema<Api_ extends AnyWithProps> = Api_["schema"];

  export type Groups<Api_ extends AnyWithProps> = Spec.Spec.Groups<
    Api_["spec"]
  >;
}

const Proto = {
  [TypeId]: TypeId,
};

const makeProto = <
  Schema_ extends DatabaseSchema.DatabaseSchema.AnyWithProps,
  Spec_ extends Spec.Spec.AnyWithProps,
>({
  schema,
  spec,
}: {
  schema: DatabaseSchema.DatabaseSchema.AnyWithProps;
  spec: Spec_;
}): Api<Schema_, Spec_> =>
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
  Schema_ extends DatabaseSchema.DatabaseSchema.AnyWithProps,
  Spec_ extends Spec.Spec.AnyWithProps,
>(
  schema: Schema_,
  spec: Spec_,
): Api<Schema_, Spec_> => makeProto({ schema, spec });
