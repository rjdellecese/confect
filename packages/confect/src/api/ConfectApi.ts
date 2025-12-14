import type { GenericSchema, SchemaDefinition } from "convex/server";
import { defineSchema as defineConvexSchema } from "convex/server";
import { pipe, Predicate, Record } from "effect";
import type * as ConfectSchema from "../server/ConfectSchema";
import type * as ConfectApiGroup from "./ConfectApiGroup";
import type * as ConfectApiSpec from "./ConfectApiSpec";

export const TypeId = "@rjdellecese/confect/ConfectApi";
export type TypeId = typeof TypeId;

export const isConfectApi = (u: unknown): u is ConfectApi.Any =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApi<
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any,
> {
  readonly [TypeId]: TypeId;
  readonly spec: ConfectApiSpec.ConfectApiSpec<Groups>;
  readonly confectSchema: ConfectSchema_;
  readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
}

export declare namespace ConfectApi {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps {
    readonly [TypeId]: TypeId;
    readonly spec: ConfectApiSpec.ConfectApiSpec.AnyWithProps;
    readonly confectSchema: ConfectSchema.ConfectSchema.AnyWithProps;
    readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
  }

  // eslint-disable-next-line @typescript-eslint/no-shadow
  export type ConfectSchema<Api extends AnyWithProps> = Api["confectSchema"];

  export type Groups<Api extends AnyWithProps> =
    Api extends ConfectApi<infer _ConfectSchema, infer Groups_>
      ? Groups_ extends ConfectApiGroup.ConfectApiGroup.AnyWithProps
        ? Groups_
        : never
      : never;
}

const Proto = {
  [TypeId]: TypeId,
};

const makeProto = <
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any,
>({
  confectSchema,
  spec,
}: {
  confectSchema: ConfectSchema.ConfectSchema.AnyWithProps;
  spec: ConfectApiSpec.ConfectApiSpec<Groups>;
}): ConfectApi<ConfectSchema_, Groups> =>
  Object.assign(Object.create(Proto), {
    spec,
    confectSchema,
    convexSchemaDefinition: pipe(
      confectSchema.tables,
      Record.map(({ tableDefinition }) => tableDefinition),
      defineConvexSchema,
    ),
  });

export const make = <
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any,
>(
  confectSchema: ConfectSchema_,
  spec: ConfectApiSpec.ConfectApiSpec<Groups>,
): ConfectApi<ConfectSchema_, Groups> => makeProto({ spec, confectSchema });
