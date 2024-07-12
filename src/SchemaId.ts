import { Schema } from "@effect/schema";
import { GenericId } from "convex/values";

export const SchemaId = <TableName extends string>(): Schema.Schema<
  GenericId<TableName>
> => Schema.String as unknown as Schema.Schema<GenericId<TableName>>;

export type SchemaId<TableName extends string> = Schema.Schema.Type<
  typeof SchemaId<TableName>
>;
