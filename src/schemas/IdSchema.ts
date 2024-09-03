import { Schema } from "@effect/schema";
import type { GenericId } from "convex/values";

export const IdSchema = <TableName extends string>(): Schema.Schema<
	GenericId<TableName>
> => Schema.String as unknown as Schema.Schema<GenericId<TableName>>;
