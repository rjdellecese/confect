import type { ConfectApiSpec } from "@rjdellecese/confect/api";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import { defineSchema as defineConvexSchema } from "convex/server";
import { pipe, Predicate, Record } from "effect";
import type * as ConfectSchema from "./ConfectSchema";

export const TypeId = "@rjdellecese/confect/server/ConfectApi";
export type TypeId = typeof TypeId;

export const isConfectApi = (u: unknown): u is ConfectApi.Any =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApi<
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  ConfectApiSpec_ extends ConfectApiSpec.ConfectApiSpec.AnyWithProps,
> {
  readonly [TypeId]: TypeId;
  readonly spec: ConfectApiSpec_;
  readonly confectSchema: ConfectSchema_;
  readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
}

export declare namespace ConfectApi {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps extends Any {
    readonly spec: ConfectApiSpec.ConfectApiSpec.AnyWithProps;
    readonly confectSchema: ConfectSchema.ConfectSchema.AnyWithProps;
    readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
  }

  // eslint-disable-next-line @typescript-eslint/no-shadow
  export type ConfectSchema<Api extends AnyWithProps> = Api["confectSchema"];

  export type Groups<ConfectApi_ extends AnyWithProps> =
    ConfectApiSpec.ConfectApiSpec.Groups<ConfectApi_["spec"]>;
}

const Proto = {
  [TypeId]: TypeId,
};

const makeProto = <
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  ConfectApiSpec_ extends ConfectApiSpec.ConfectApiSpec.AnyWithProps,
>({
  confectSchema,
  spec,
}: {
  confectSchema: ConfectSchema.ConfectSchema.AnyWithProps;
  spec: ConfectApiSpec_;
}): ConfectApi<ConfectSchema_, ConfectApiSpec_> =>
  Object.assign(Object.create(Proto), {
    confectSchema,
    spec,
    convexSchemaDefinition: pipe(
      confectSchema.tables,
      Record.map(({ tableDefinition }) => tableDefinition),
      defineConvexSchema,
    ),
  });

export const make = <
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  ConfectApiSpec_ extends ConfectApiSpec.ConfectApiSpec.AnyWithProps,
>(
  confectSchema: ConfectSchema_,
  spec: ConfectApiSpec_,
): ConfectApi<ConfectSchema_, ConfectApiSpec_> =>
  makeProto({ confectSchema, spec });
