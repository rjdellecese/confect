import { Schema } from "@effect/schema";
import type { GenericId } from "convex/values";

export const Id = <TableName extends string>(): Schema.Schema<
	GenericId<TableName>
> => Schema.String as unknown as Schema.Schema<GenericId<TableName>>;
