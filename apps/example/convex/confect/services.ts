import {
  ConfectActionRunner as ConfectActionRunner_,
  ConfectAuth as ConfectAuth_,
  ConfectDatabaseReader as ConfectDatabaseReader_,
  ConfectDatabaseWriter as ConfectDatabaseWriter_,
  ConfectMutationRunner as ConfectMutationRunner_,
  ConfectQueryRunner as ConfectQueryRunner_,
  ConfectScheduler as ConfectScheduler_,
  ConfectSchema,
  ConfectStorage,
  ConfectVectorSearch as ConfectVectorSearch_,
  ConvexActionCtx as ConvexActionCtx_,
  ConvexMutationCtx as ConvexMutationCtx_,
  ConvexQueryCtx as ConvexQueryCtx_,
} from "@rjdellecese/confect/server";
import confectSchemaDefinition from "../../confect/schema";

export const ConfectAuth = ConfectAuth_.ConfectAuth;
export type ConfectAuth = typeof ConfectAuth.Identifier;

export const ConfectScheduler = ConfectScheduler_.ConfectScheduler;
export type ConfectScheduler = typeof ConfectScheduler.Identifier;

export const ConfectStorageReader = ConfectStorage.ConfectStorageReader;
export type ConfectStorageReader = typeof ConfectStorageReader.Identifier;

export const ConfectStorageWriter = ConfectStorage.ConfectStorageWriter;
export type ConfectStorageWriter = typeof ConfectStorageWriter.Identifier;

export const ConfectStorageActionWriter =
  ConfectStorage.ConfectStorageActionWriter;
export type ConfectStorageActionWriter =
  typeof ConfectStorageActionWriter.Identifier;

export const ConfectVectorSearch = ConfectVectorSearch_.ConfectVectorSearch;
export type ConfectVectorSearch = typeof ConfectVectorSearch.Identifier;

export const ConfectDatabaseReader =
  ConfectDatabaseReader_.ConfectDatabaseReader<
    typeof confectSchemaDefinition
  >();
export type ConfectDatabaseReader = typeof ConfectDatabaseReader.Identifier;

export const ConfectDatabaseWriter =
  ConfectDatabaseWriter_.ConfectDatabaseWriter<
    typeof confectSchemaDefinition
  >();
export type ConfectDatabaseWriter = typeof ConfectDatabaseWriter.Identifier;

export const ConfectQueryRunner = ConfectQueryRunner_.ConfectQueryRunner;
export type ConfectQueryRunner = typeof ConfectQueryRunner.Identifier;

export const ConfectMutationRunner =
  ConfectMutationRunner_.ConfectMutationRunner;
export type ConfectMutationRunner = typeof ConfectMutationRunner.Identifier;

export const ConfectActionRunner = ConfectActionRunner_.ConfectActionRunner;
export type ConfectActionRunner = typeof ConfectActionRunner.Identifier;

export const ConvexQueryCtx =
  ConvexQueryCtx_.ConvexQueryCtx<
    ConfectSchema.DataModelFromConfectSchema<typeof confectSchemaDefinition>
  >();
export type ConvexQueryCtx = typeof ConvexQueryCtx.Identifier;

export const ConvexMutationCtx =
  ConvexMutationCtx_.ConvexMutationCtx<
    ConfectSchema.DataModelFromConfectSchema<typeof confectSchemaDefinition>
  >();
export type ConvexMutationCtx = typeof ConvexMutationCtx.Identifier;

export const ConvexActionCtx =
  ConvexActionCtx_.ConvexActionCtx<
    ConfectSchema.DataModelFromConfectSchema<typeof confectSchemaDefinition>
  >();
export type ConvexActionCtx = typeof ConvexActionCtx.Identifier;
