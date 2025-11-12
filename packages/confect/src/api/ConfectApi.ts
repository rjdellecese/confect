import { Predicate } from "effect";
import {
  ConfectSchemaDefinition,
  GenericConfectSchema,
} from "../server/ConfectSchema";
import * as ConfectApiGroup from "./ConfectApiGroup";
import * as ConfectApiSpec from "./ConfectApiSpec";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApi");

export type TypeId = typeof TypeId;

export const isConfectApi = (u: unknown): u is ConfectApi.Any =>
  Predicate.hasProperty(u, TypeId);

// TODO: Rename this to ConfectApiScaffolding? Or something else?
export interface ConfectApi<
  ConfectSchema extends GenericConfectSchema,
  Name extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any,
> {
  readonly [TypeId]: TypeId;
  readonly spec: ConfectApiSpec.ConfectApiSpec<Name, Groups>;
  readonly confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>;
}

export declare namespace ConfectApi {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps
    extends ConfectApi<
      GenericConfectSchema,
      string,
      ConfectApiGroup.ConfectApiGroup.AnyWithProps
    > {}

  export type ConfectSchema<ConfectApi extends AnyWithProps> =
    ConfectApi["confectSchemaDefinition"]["confectSchema"];
}

const Proto = {
  [TypeId]: TypeId,
};

const makeProto = <
  ConfectSchema extends GenericConfectSchema,
  const Name extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any,
>({
  confectSchemaDefinition,
  spec,
}: {
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>;
  spec: ConfectApiSpec.ConfectApiSpec<Name, Groups>;
}): ConfectApi<ConfectSchema, Name, Groups> =>
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
  spec: ConfectApiSpec.ConfectApiSpec<Name, Groups>
): ConfectApi<ConfectSchema, Name, Groups> =>
  makeProto({ confectSchemaDefinition, spec });
