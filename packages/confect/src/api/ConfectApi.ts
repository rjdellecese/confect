import { Predicate } from "effect";
import type {
  ConfectSchemaDefinition,
  GenericConfectSchema,
} from "../server/ConfectSchema";
import type * as ConfectApiGroup from "./ConfectApiGroup";
import type * as ConfectApiSpec from "./ConfectApiSpec";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApi");

export type TypeId = typeof TypeId;

export const isConfectApi = (u: unknown): u is ConfectApi.Any =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApi<
  ConfectSchema extends GenericConfectSchema,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any,
> {
  readonly [TypeId]: TypeId;
  readonly spec: ConfectApiSpec.ConfectApiSpec<Groups>;
  readonly confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>;
}

export declare namespace ConfectApi {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps
    extends ConfectApi<
      GenericConfectSchema,
      ConfectApiGroup.ConfectApiGroup.AnyWithProps
    > {}

  export type ConfectSchema<Api extends AnyWithProps> =
    Api["confectSchemaDefinition"]["confectSchema"];
}

const Proto = {
  [TypeId]: TypeId,
};

const makeProto = <
  ConfectSchema extends GenericConfectSchema,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any,
>({
  confectSchemaDefinition,
  spec,
}: {
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>;
  spec: ConfectApiSpec.ConfectApiSpec<Groups>;
}): ConfectApi<ConfectSchema, Groups> =>
  Object.assign(Object.create(Proto), {
    confectSchemaDefinition,
    spec,
  });

export const make = <
  ConfectSchema extends GenericConfectSchema,
  const Name extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
  spec: ConfectApiSpec.ConfectApiSpec<Groups>,
): ConfectApi<ConfectSchema, Groups> =>
  makeProto({ confectSchemaDefinition, spec });
