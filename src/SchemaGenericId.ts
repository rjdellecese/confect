import { Schema } from "@effect/schema";
import type { GenericId } from "convex/values";

// TODO: Is this being used?
export const SchemaGenericId = <TableName extends string>(): Schema.Schema<
	GenericId<TableName>,
	string
> => Schema.String as any;
