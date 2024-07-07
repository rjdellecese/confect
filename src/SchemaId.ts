import { Schema } from "@effect/schema";
import { GenericId } from "convex/values";

export const SchemaId = <TableName extends string>(): Schema.Schema<
  GenericId<TableName>
> =>
  // TODO: Probably a better way to do this
  Schema.String as unknown as Schema.Schema<GenericId<TableName>>;
