import { DatabaseSchema } from "./DatabaseSchema.js";
import { DataModel, DocumentByName as DocumentByName$1 } from "./DataModel.js";
import { Document, DocumentDecodeError, DocumentEncodeError } from "./Document.js";
import { GetByIdFailure } from "./QueryInitializer.js";
import { Context, Effect, Layer } from "effect";
import { BetterOmit, Expand, GenericDatabaseWriter, WithoutSystemFields } from "convex/server";
import { GenericId } from "convex/values";

//#region src/server/DatabaseWriter.d.ts
declare namespace DatabaseWriter_d_exports {
  export { DatabaseWriter, layer, make };
}
declare const make: <Schema$1 extends DatabaseSchema.AnyWithProps>(schema: Schema$1, convexDatabaseWriter: GenericDatabaseWriter<DataModel.ToConvex<DataModel.FromSchema<Schema$1>>>) => {
  insert: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(tableName: TableName, document: Document.WithoutSystemFields<DocumentByName$1<DataModel.FromSchema<Schema$1>, TableName>>) => Effect.Effect<GenericId<TableName>, DocumentEncodeError, never>;
  patch: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(tableName: TableName, id: GenericId<TableName>, patchedValues: Partial<WithoutSystemFields<DocumentByName$1<DataModel.FromSchema<Schema$1>, TableName>>>) => Effect.Effect<void, DocumentDecodeError | DocumentEncodeError | GetByIdFailure, never>;
  replace: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(tableName: TableName, id: GenericId<TableName>, value: WithoutSystemFields<DocumentByName$1<DataModel.FromSchema<Schema$1>, TableName>>) => Effect.Effect<void, DocumentEncodeError, never>;
  delete: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(_tableName: TableName, id: GenericId<TableName>) => Effect.Effect<void, never, never>;
};
declare const DatabaseWriter: <Schema$1 extends DatabaseSchema.AnyWithProps>() => Context.Tag<{
  insert: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(tableName: TableName, document: Document.WithoutSystemFields<DocumentByName$1<DataModel.FromSchema<Schema$1>, TableName>>) => Effect.Effect<GenericId<TableName>, DocumentEncodeError, never>;
  patch: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(tableName: TableName, id: GenericId<TableName>, patchedValues: Partial<Expand<BetterOmit<DocumentByName$1<DataModel.FromSchema<Schema$1>, TableName>, "_id" | "_creationTime">>>) => Effect.Effect<void, DocumentDecodeError | DocumentEncodeError | GetByIdFailure, never>;
  replace: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(tableName: TableName, id: GenericId<TableName>, value: Expand<BetterOmit<DocumentByName$1<DataModel.FromSchema<Schema$1>, TableName>, "_id" | "_creationTime">>) => Effect.Effect<void, DocumentEncodeError, never>;
  delete: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(_tableName: TableName, id: GenericId<TableName>) => Effect.Effect<void, never, never>;
}, {
  insert: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(tableName: TableName, document: Document.WithoutSystemFields<DocumentByName$1<DataModel.FromSchema<Schema$1>, TableName>>) => Effect.Effect<GenericId<TableName>, DocumentEncodeError, never>;
  patch: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(tableName: TableName, id: GenericId<TableName>, patchedValues: Partial<Expand<BetterOmit<DocumentByName$1<DataModel.FromSchema<Schema$1>, TableName>, "_id" | "_creationTime">>>) => Effect.Effect<void, DocumentDecodeError | DocumentEncodeError | GetByIdFailure, never>;
  replace: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(tableName: TableName, id: GenericId<TableName>, value: Expand<BetterOmit<DocumentByName$1<DataModel.FromSchema<Schema$1>, TableName>, "_id" | "_creationTime">>) => Effect.Effect<void, DocumentEncodeError, never>;
  delete: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(_tableName: TableName, id: GenericId<TableName>) => Effect.Effect<void, never, never>;
}>;
type DatabaseWriter<Schema$1 extends DatabaseSchema.AnyWithProps> = ReturnType<typeof DatabaseWriter<Schema$1>>["Identifier"];
declare const layer: <Schema$1 extends DatabaseSchema.AnyWithProps>(schema: Schema$1, convexDatabaseWriter: GenericDatabaseWriter<DataModel.ToConvex<DataModel.FromSchema<Schema$1>>>) => Layer.Layer<{
  insert: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(tableName: TableName, document: Document.WithoutSystemFields<DocumentByName$1<DataModel.FromSchema<Schema$1>, TableName>>) => Effect.Effect<GenericId<TableName>, DocumentEncodeError, never>;
  patch: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(tableName: TableName, id: GenericId<TableName>, patchedValues: Partial<Expand<BetterOmit<DocumentByName$1<DataModel.FromSchema<Schema$1>, TableName>, "_id" | "_creationTime">>>) => Effect.Effect<void, DocumentDecodeError | DocumentEncodeError | GetByIdFailure, never>;
  replace: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(tableName: TableName, id: GenericId<TableName>, value: Expand<BetterOmit<DocumentByName$1<DataModel.FromSchema<Schema$1>, TableName>, "_id" | "_creationTime">>) => Effect.Effect<void, DocumentEncodeError, never>;
  delete: <TableName extends DataModel.TableNames<DataModel.FromSchema<Schema$1>>>(_tableName: TableName, id: GenericId<TableName>) => Effect.Effect<void, never, never>;
}, never, never>;
//#endregion
export { DatabaseWriter, DatabaseWriter_d_exports, layer, make };
//# sourceMappingURL=DatabaseWriter.d.ts.map