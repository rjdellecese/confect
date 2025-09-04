import { Predicate } from "effect";
import {
  ConfectSchemaDefinition,
  GenericConfectSchema,
} from "../server/schema";
import * as ConfectApi from "./ConfectApi";
import * as ConfectApiGroup from "./ConfectApiGroup";

export const TypeId = Symbol.for(
  "@rjdellecese/confect/ConfectApiWithDatabaseSchema"
);

export type TypeId = typeof TypeId;

export const isConfectApiWithDatabaseSchema = (
  u: unknown
): u is ConfectApiWithDatabaseSchema.Any => Predicate.hasProperty(u, TypeId);

// TODO: Rename this to ConfectApiScaffolding? Or something else?
export interface ConfectApiWithDatabaseSchema<
  ConfectSchema extends GenericConfectSchema,
  Name extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any,
> {
  readonly [TypeId]: TypeId;
  readonly api: ConfectApi.ConfectApi<Name, Groups>;
  readonly confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>;
}

export declare namespace ConfectApiWithDatabaseSchema {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps
    extends ConfectApiWithDatabaseSchema<
      GenericConfectSchema,
      string,
      ConfectApiGroup.ConfectApiGroup.AnyWithProps
    > {}
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
  api,
}: {
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>;
  api: ConfectApi.ConfectApi<Name, Groups>;
}): ConfectApiWithDatabaseSchema<ConfectSchema, Name, Groups> =>
  Object.assign(Object.create(Proto), {
    confectSchemaDefinition,
    api,
  });

export const make = <
  ConfectSchema extends GenericConfectSchema,
  const Name extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
  api: ConfectApi.ConfectApi<Name, Groups>
): ConfectApiWithDatabaseSchema<ConfectSchema, Name, Groups> =>
  makeProto({ confectSchemaDefinition, api });
