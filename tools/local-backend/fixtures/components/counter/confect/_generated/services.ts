import {
  ActionCtx as ActionCtx_,
  ActionRunner as ActionRunner_,
  type DataModel,
  DatabaseReader as DatabaseReader_,
  DatabaseWriter as DatabaseWriter_,
  DocumentIds as DocumentIds_,
  ExecutionMetadata as ExecutionMetadata_,
  MutationCtx as MutationCtx_,
  MutationRunner as MutationRunner_,
  MutationTransactionContext as MutationTransactionContext_,
  QueryCtx as QueryCtx_,
  QueryRunner as QueryRunner_,
  QueryTransactionContext as QueryTransactionContext_,
  RequestMetadata as RequestMetadata_,
  Scheduler as Scheduler_,
  Storage as Storage_,
  StorageActionWriter as StorageActionWriter_,
  StorageReader as StorageReader_,
  StorageWriter as StorageWriter_,
  TransactionMetadata as TransactionMetadata_,
  VectorSearch as VectorSearch_,
} from "@confect/server";
import type schemaDefinition from "./schema";
import type { Docs } from "./docs";
import type { scope } from "./id";


export const ExecutionMetadata = ExecutionMetadata_.ExecutionMetadata;
export type ExecutionMetadata = typeof ExecutionMetadata.Identifier;

export const RequestMetadata = RequestMetadata_.RequestMetadata;
export type RequestMetadata = typeof RequestMetadata.Identifier;

export const TransactionMetadata = TransactionMetadata_.TransactionMetadata;
export type TransactionMetadata = typeof TransactionMetadata.Identifier;

export const Scheduler = Scheduler_.forScope<typeof scope>();
export type Scheduler = typeof Scheduler.Identifier;

export const Storage = Storage_.Storage.forScope<typeof scope>();
export type Storage = typeof Storage.Identifier;

export const StorageReader = StorageReader_.StorageReader.forScope<typeof scope>();
export type StorageReader = typeof StorageReader.Identifier;

export const StorageWriter = StorageWriter_.StorageWriter.forScope<typeof scope>();
export type StorageWriter = typeof StorageWriter.Identifier;

export const StorageActionWriter = StorageActionWriter_.StorageActionWriter.forScope<typeof scope>();
export type StorageActionWriter = typeof StorageActionWriter.Identifier;

export const VectorSearch: VectorSearch_.VectorSearchTag<
  DataModel.FromSchema<typeof schemaDefinition>
> = VectorSearch_.VectorSearch<DataModel.FromSchema<typeof schemaDefinition>>();
export type VectorSearch = typeof VectorSearch.Identifier;

export const DocumentIds: DocumentIds_.DocumentIdsTag<typeof schemaDefinition> = DocumentIds_.DocumentIds<typeof schemaDefinition>();
export type DocumentIds = typeof DocumentIds.Identifier;

export const DatabaseReader: DatabaseReader_.DatabaseReaderTag<
  typeof schemaDefinition,
  Docs
> = DatabaseReader_.DatabaseReader<typeof schemaDefinition, Docs>();
export type DatabaseReader = typeof DatabaseReader.Identifier;

export const DatabaseWriter: DatabaseWriter_.DatabaseWriterTag<
  typeof schemaDefinition,
  Docs
> = DatabaseWriter_.DatabaseWriter<typeof schemaDefinition, Docs>();
export type DatabaseWriter = typeof DatabaseWriter.Identifier;

export const QueryTransactionContext = QueryTransactionContext_.QueryTransactionContext;
export type QueryTransactionContext = typeof QueryTransactionContext.Identifier;

export const MutationTransactionContext = MutationTransactionContext_.MutationTransactionContext;
export type MutationTransactionContext = typeof MutationTransactionContext.Identifier;

export const QueryRunner = QueryRunner_.QueryRunner;
export type QueryRunner = typeof QueryRunner.Identifier;

export const MutationRunner = MutationRunner_.MutationRunner;
export type MutationRunner = typeof MutationRunner.Identifier;

export const ActionRunner = ActionRunner_.ActionRunner;
export type ActionRunner = typeof ActionRunner.Identifier;

export const QueryCtx: QueryCtx_.QueryCtxTag<
  DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>, typeof scope
> = QueryCtx_.QueryCtx<
  DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>, typeof scope
>();
export type QueryCtx = typeof QueryCtx.Identifier;

export const MutationCtx: MutationCtx_.MutationCtxTag<
  DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>, typeof scope
> = MutationCtx_.MutationCtx<
  DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>, typeof scope
>();
export type MutationCtx = typeof MutationCtx.Identifier;

export const ActionCtx: ActionCtx_.ActionCtxTag<
  DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>, typeof scope
> = ActionCtx_.ActionCtx<
  DataModel.ToConvex<DataModel.FromSchema<typeof schemaDefinition>>, typeof scope
>();
export type ActionCtx = typeof ActionCtx.Identifier;
