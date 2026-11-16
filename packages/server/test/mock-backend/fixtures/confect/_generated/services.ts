import {
  ActionCtx as ActionCtx_,
  ActionRunner as ActionRunner_,
  Auth as Auth_,
  type DataModel,
  DatabaseReader as DatabaseReader_,
  DatabaseWriter as DatabaseWriter_,
  DocumentIds as DocumentIds_,
  ExecutionMetadata as ExecutionMetadata_,
  MutationAuth as MutationAuth_,
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

/**
 * Authentication service tag, provided in queries, mutations, actions, and HTTP handlers.
 * Yield this tag to read the caller's identity; getUserIdentity fails with NoUserIdentityFoundError when unauthenticated.
 * @category Services
 */
export const Auth = Auth_.Auth;
/**
 * Effect environment requirement for {@link Auth}.
 * @category Services
 */
export type Auth = typeof Auth.Identifier;

/**
 * JWT-signing service tag, provided only in mutations.
 * Yield this tag and pass SignJwtOptions to signJwt; signing failures are defects.
 * @category Services
 */
export const MutationAuth = MutationAuth_.MutationAuth;
/**
 * Effect environment requirement for {@link MutationAuth}.
 * @category Services
 */
export type MutationAuth = typeof MutationAuth.Identifier;

/**
 * Execution metadata service tag, provided in queries, mutations, actions, and HTTP handlers.
 * Yield this tag to read function and deployment metadata.
 * @category Services
 */
export const ExecutionMetadata = ExecutionMetadata_.ExecutionMetadata;
/**
 * Effect environment requirement for {@link ExecutionMetadata}.
 * @category Services
 */
export type ExecutionMetadata = typeof ExecutionMetadata.Identifier;

/**
 * Request metadata service tag, provided in mutations, actions, and HTTP handlers, not queries.
 * Yield this tag to read metadata for the current request.
 * @category Services
 */
export const RequestMetadata = RequestMetadata_.RequestMetadata;
/**
 * Effect environment requirement for {@link RequestMetadata}.
 * @category Services
 */
export type RequestMetadata = typeof RequestMetadata.Identifier;

/**
 * Transaction metadata service tag, provided in queries and mutations.
 * Yield this tag to read transaction metrics and the snapshot timestamp.
 * @category Services
 */
export const TransactionMetadata = TransactionMetadata_.TransactionMetadata;
/**
 * Effect environment requirement for {@link TransactionMetadata}.
 * @category Services
 */
export type TransactionMetadata = typeof TransactionMetadata.Identifier;

/**
 * Scheduling service tag, provided in mutations, actions, and HTTP handlers.
 * Yield this tag to schedule mutation or action refs with an Effect Duration or DateTime, or cancel a scheduled ID.
 * Scheduling returns the scheduled-function ID; argument encoding can throw synchronously.
 * @category Services
 */
export const Scheduler = Scheduler_.Scheduler;
/**
 * Effect environment requirement for {@link Scheduler}.
 * @category Services
 */
export type Scheduler = typeof Scheduler.Identifier;

/**
 * Storage facade tag, provided in queries, mutations, actions, and HTTP handlers.
 * getUrl returns a URL or fails with BlobNotFoundError. Upload URLs and deletion require StorageWriter;
 * blob reads and writes require StorageActionWriter. Both writer services are provided in mutations, actions, and HTTP handlers.
 * @category Services
 */
export const Storage = Storage_.Storage;
/**
 * Effect environment requirement for {@link Storage}.
 * @category Services
 */
export type Storage = typeof Storage.Identifier;

/**
 * Compatibility storage URL service tag, provided in queries, mutations, actions, and HTTP handlers.
 * Use Storage in new code. getUrl resolves a storage ID to a URL or fails with BlobNotFoundError.
 * @category Services
 */
export const StorageReader = StorageReader_.StorageReader;
/**
 * Compatibility environment requirement for {@link StorageReader}; use Storage in new code.
 * @category Services
 */
export type StorageReader = typeof StorageReader.Identifier;

/**
 * Compatibility storage write service tag, provided in mutations, actions, and HTTP handlers.
 * Use Storage in new code. This service generates upload URLs and deletes files; deletion failures become BlobNotFoundError.
 * @category Services
 */
export const StorageWriter = StorageWriter_.StorageWriter;
/**
 * Compatibility environment requirement for {@link StorageWriter}; use Storage in new code.
 * @category Services
 */
export type StorageWriter = typeof StorageWriter.Identifier;

/**
 * Compatibility blob storage service tag, provided in mutations, actions, and HTTP handlers despite its name.
 * Use Storage in new code.
 * get returns a Blob or fails with BlobNotFoundError; store accepts a Blob and optional sha256 and returns a storage ID.
 * @category Services
 */
export const StorageActionWriter = StorageActionWriter_.StorageActionWriter;
/**
 * Compatibility environment requirement for {@link StorageActionWriter}; use Storage in new code.
 * @category Services
 */
export type StorageActionWriter = typeof StorageActionWriter.Identifier;

/**
 * Schema-typed vector search service tag, provided in actions and HTTP handlers.
 * Yield this tag and call it with a table, vector index, and search options to return document IDs and scores.
 * Convex search failures are defects; results do not contain decoded documents.
 * @public
 * @category Services
 */
export const VectorSearch: VectorSearch_.VectorSearchTag<
  DataModel.FromDatabaseSchema<typeof schemaDefinition>
> = VectorSearch_.VectorSearch<DataModel.FromDatabaseSchema<typeof schemaDefinition>>();
/**
 * Effect environment requirement for {@link VectorSearch}.
 * @public
 * @category Services
 */
export type VectorSearch = typeof VectorSearch.Identifier;

/**
 * Schema-typed ID validation service tag, provided in queries and mutations.
 * parse checks a string against a table; identify checks application and system tables.
 * Both return Option.none for invalid IDs and do not check whether the document exists.
 * @public
 * @category Services
 */
export const DocumentIds: DocumentIds_.DocumentIdsTag<typeof schemaDefinition> = DocumentIds_.DocumentIds<typeof schemaDefinition>();
/**
 * Effect environment requirement for {@link DocumentIds}.
 * @public
 * @category Services
 */
export type DocumentIds = typeof DocumentIds.Identifier;

/**
 * Schema-typed database reader tag, provided in queries and mutations.
 * Yield this tag to read decoded documents using the generated Docs aliases.
 * Document decoding failures use DocumentDecodeError; table(name).get(id) fails with GetByIdFailure when absent.
 * @public
 * @category Services
 */
export const DatabaseReader: DatabaseReader_.DatabaseReaderTag<
  typeof schemaDefinition,
  Docs
> = DatabaseReader_.DatabaseReader<typeof schemaDefinition, Docs>();
/**
 * Effect environment requirement for {@link DatabaseReader}.
 * @public
 * @category Services
 */
export type DatabaseReader = typeof DatabaseReader.Identifier;

/**
 * Schema-typed database writer tag, provided only in mutations.
 * Yield this tag and select table(name) to insert, patch, replace, or delete documents using decoded field values.
 * Inserts, patches, and replacements encode values through the table schema; see each operation's error behavior.
 * @public
 * @category Services
 */
export const DatabaseWriter: DatabaseWriter_.DatabaseWriterTag<
  typeof schemaDefinition,
  Docs
> = DatabaseWriter_.DatabaseWriter<typeof schemaDefinition, Docs>();
/**
 * Effect environment requirement for {@link DatabaseWriter}.
 * @public
 * @category Services
 */
export type DatabaseWriter = typeof DatabaseWriter.Identifier;

/**
 * Transaction controls tag, provided in queries and mutations.
 * Prefer QueryRunner.runQuery with transactionLimits; it requests this service when options are supplied.
 * @internal
 */
export const QueryTransactionContext = QueryTransactionContext_.QueryTransactionContext;
/**
 * Effect environment requirement for {@link QueryTransactionContext}.
 * @internal
 */
export type QueryTransactionContext = typeof QueryTransactionContext.Identifier;

/**
 * Mutation transaction controls tag, provided only in mutations.
 * QueryRunner requests this service for useStaleSnapshot; MutationRunner requests it for transactionLimits.
 * @internal
 */
export const MutationTransactionContext = MutationTransactionContext_.MutationTransactionContext;
/**
 * Effect environment requirement for {@link MutationTransactionContext}.
 * @internal
 */
export type MutationTransactionContext = typeof MutationTransactionContext.Identifier;

/**
 * Query invocation service tag, provided in queries, mutations, actions, and HTTP handlers.
 * runQuery accepts a query ref and decoded arguments and returns its decoded result as an Effect.
 * Declared errors and SchemaError are typed failures. transactionLimits require a query or mutation;
 * useStaleSnapshot requires a mutation.
 * @category Services
 */
export const QueryRunner = QueryRunner_.QueryRunner;
/**
 * Effect environment requirement for {@link QueryRunner}.
 * @category Services
 */
export type QueryRunner = typeof QueryRunner.Identifier;

/**
 * Mutation invocation service tag, provided in mutations, actions, and HTTP handlers.
 * runMutation accepts a mutation ref and decoded arguments and returns its decoded result as an Effect.
 * Declared errors and SchemaError are typed failures. transactionLimits require a mutation context.
 * @category Services
 */
export const MutationRunner = MutationRunner_.MutationRunner;
/**
 * Effect environment requirement for {@link MutationRunner}.
 * @category Services
 */
export type MutationRunner = typeof MutationRunner.Identifier;

/**
 * Action invocation service tag, provided in actions and HTTP handlers.
 * runAction accepts an action ref and decoded arguments and returns its decoded result as an Effect.
 * Declared errors and SchemaError are typed failures.
 * @category Services
 */
export const ActionRunner = ActionRunner_.ActionRunner;
/**
 * Effect environment requirement for {@link ActionRunner}.
 * @category Services
 */
export type ActionRunner = typeof ActionRunner.Identifier;

/**
 * Schema-typed native Convex query context tag, provided only in queries.
 * Yield this tag to access raw Convex APIs; document values use encoded rather than Confect-decoded types.
 * @public
 * @category Services
 */
export const QueryCtx: QueryCtx_.QueryCtxTag<
  DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>
> = QueryCtx_.QueryCtx<
  DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>
>();
/**
 * Effect environment requirement for {@link QueryCtx}.
 * @public
 * @category Services
 */
export type QueryCtx = typeof QueryCtx.Identifier;

/**
 * Schema-typed native Convex mutation context tag, provided only in mutations.
 * Yield this tag to access raw Convex APIs; document values use encoded rather than Confect-decoded types.
 * @public
 * @category Services
 */
export const MutationCtx: MutationCtx_.MutationCtxTag<
  DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>
> = MutationCtx_.MutationCtx<
  DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>
>();
/**
 * Effect environment requirement for {@link MutationCtx}.
 * @public
 * @category Services
 */
export type MutationCtx = typeof MutationCtx.Identifier;

/**
 * Schema-typed native Convex action context tag, provided in actions.
 * Yield this tag to access raw Convex APIs; function arguments and results use their wire representations.
 * @public
 * @category Services
 */
export const ActionCtx: ActionCtx_.ActionCtxTag<
  DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>
> = ActionCtx_.ActionCtx<
  DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>
>();
/**
 * Effect environment requirement for {@link ActionCtx}.
 * @public
 * @category Services
 */
export type ActionCtx = typeof ActionCtx.Identifier;
