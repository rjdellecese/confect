import type { DataModel } from "../../../src/server/index";
import {
  ActionRunner as ActionRunner_,
  Auth as Auth_,
  DatabaseReader as DatabaseReader_,
  DatabaseWriter as DatabaseWriter_,
  MutationRunner as MutationRunner_,
  QueryRunner as QueryRunner_,
  Scheduler as Scheduler_,
  Storage,
  VectorSearch as VectorSearch_,
  ActionCtx as ActionCtx_,
  MutationCtx as MutationCtx_,
  QueryCtx as QueryCtx_,
} from "../../../src/server/index";
import type schemaDefinition from "../../confect/schema";

export const Auth = Auth_.Auth;
export type Auth = typeof Auth.Identifier;

export const Scheduler = Scheduler_.Scheduler;
export type Scheduler = typeof Scheduler.Identifier;

export const StorageReader = Storage.StorageReader;
export type StorageReader = typeof StorageReader.Identifier;

export const StorageWriter = Storage.StorageWriter;
export type StorageWriter = typeof StorageWriter.Identifier;

export const StorageActionWriter = Storage.StorageActionWriter;
export type StorageActionWriter = typeof StorageActionWriter.Identifier;

export const VectorSearch =
  VectorSearch_.VectorSearch<
    DataModel.DataModel.FromSchema<typeof schemaDefinition>
  >();
export type VectorSearch = typeof VectorSearch.Identifier;

export const DatabaseReader =
  DatabaseReader_.DatabaseReader<typeof schemaDefinition>();
export type DatabaseReader = typeof DatabaseReader.Identifier;

export const DatabaseWriter =
  DatabaseWriter_.DatabaseWriter<typeof schemaDefinition>();
export type DatabaseWriter = typeof DatabaseWriter.Identifier;

export const QueryRunner = QueryRunner_.QueryRunner;
export type QueryRunner = typeof QueryRunner.Identifier;

export const MutationRunner = MutationRunner_.MutationRunner;
export type MutationRunner = typeof MutationRunner.Identifier;

export const ActionRunner = ActionRunner_.ActionRunner;
export type ActionRunner = typeof ActionRunner.Identifier;

export const QueryCtx =
  QueryCtx_.QueryCtx<
    DataModel.DataModel.ToConvex<
      DataModel.DataModel.FromSchema<typeof schemaDefinition>
    >
  >();
export type QueryCtx = typeof QueryCtx.Identifier;

export const MutationCtx =
  MutationCtx_.MutationCtx<
    DataModel.DataModel.ToConvex<
      DataModel.DataModel.FromSchema<typeof schemaDefinition>
    >
  >();
export type MutationCtx = typeof MutationCtx.Identifier;

export const ActionCtx =
  ActionCtx_.ActionCtx<
    DataModel.DataModel.ToConvex<
      DataModel.DataModel.FromSchema<typeof schemaDefinition>
    >
  >();
export type ActionCtx = typeof ActionCtx.Identifier;
