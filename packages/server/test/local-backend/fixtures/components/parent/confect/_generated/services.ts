import {
  ActionCtx as ActionCtx_,
  ActionRunner as ActionRunner_,
  type DataModel,
  DatabaseReader as DatabaseReader_,
  DatabaseWriter as DatabaseWriter_,
  MutationCtx as MutationCtx_,
  MutationRunner as MutationRunner_,
  QueryCtx as QueryCtx_,
  QueryRunner as QueryRunner_,
  Scheduler as Scheduler_,
  StorageActionWriter as StorageActionWriter_,
  StorageReader as StorageReader_,
  StorageWriter as StorageWriter_,
  VectorSearch as VectorSearch_,
} from "@confect/server";
import type schemaDefinition from "./schema";
import type { Docs } from "./docs";
import type { scope } from "./id";


export const Scheduler = Scheduler_.forScope<typeof scope>();
export type Scheduler = typeof Scheduler.Identifier;

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
