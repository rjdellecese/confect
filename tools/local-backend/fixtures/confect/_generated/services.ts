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
 * Service tag for reading the caller's identity in queries, mutations, actions,
 * and HTTP handlers. The service's `getUserIdentity` Effect fails with
 * `NoUserIdentityFoundError` when the caller is unauthenticated.
 *
 * @category tags
 */
export const Auth = Auth_.Auth;
/**
 * Effect environment requirement for {@link Auth}.
 *
 * @category context
 */
export type Auth = typeof Auth.Identifier;

/**
 * Service tag for signing deployment JWTs in mutations. Pass `SignJwtOptions` to
 * the service's `signJwt` method; signing failures are defects.
 *
 * @category tags
 */
export const MutationAuth = MutationAuth_.MutationAuth;
/**
 * Effect environment requirement for {@link MutationAuth}.
 *
 * @category context
 */
export type MutationAuth = typeof MutationAuth.Identifier;

/**
 * Service tag for reading function and deployment metadata in queries, mutations,
 * actions, and HTTP handlers.
 *
 * @category tags
 */
export const ExecutionMetadata = ExecutionMetadata_.ExecutionMetadata;
/**
 * Effect environment requirement for {@link ExecutionMetadata}.
 *
 * @category context
 */
export type ExecutionMetadata = typeof ExecutionMetadata.Identifier;

/**
 * Service tag for reading metadata about the current request in mutations,
 * actions, and HTTP handlers. Queries do not provide request metadata.
 *
 * @category tags
 */
export const RequestMetadata = RequestMetadata_.RequestMetadata;
/**
 * Effect environment requirement for {@link RequestMetadata}.
 *
 * @category context
 */
export type RequestMetadata = typeof RequestMetadata.Identifier;

/**
 * Service tag for reading transaction metrics and the snapshot timestamp in
 * queries and mutations.
 *
 * @category tags
 */
export const TransactionMetadata = TransactionMetadata_.TransactionMetadata;
/**
 * Effect environment requirement for {@link TransactionMetadata}.
 *
 * @category context
 */
export type TransactionMetadata = typeof TransactionMetadata.Identifier;

/**
 * Service tag for scheduling mutations and actions from mutations, actions, and
 * HTTP handlers. Schedule a reference after an Effect `Duration` or at a
 * `DateTime`; use the returned scheduled-function ID to cancel the job.
 *
 * **Gotchas**
 *
 * Argument encoding can throw before the scheduling method returns an Effect.
 *
 * @category tags
 */
export const Scheduler = Scheduler_.Scheduler;
/**
 * Effect environment requirement for {@link Scheduler}.
 *
 * @category context
 */
export type Scheduler = typeof Scheduler.Identifier;

/**
 * Service tag for working with files in Convex storage. Queries, mutations,
 * actions, and HTTP handlers can resolve a storage ID to a URL; a missing file
 * fails with `BlobNotFoundError`.
 *
 * **Details**
 *
 * Upload URL generation and deletion require {@link StorageWriter}. Reading and
 * storing blobs require {@link StorageActionWriter}. Mutations, actions, and HTTP
 * handlers provide both writer services.
 *
 * @category tags
 */
export const Storage = Storage_.Storage;
/**
 * Effect environment requirement for {@link Storage}.
 *
 * @category context
 */
export type Storage = typeof Storage.Identifier;

/**
 * Compatibility tag for resolving storage IDs to URLs in queries, mutations,
 * actions, and HTTP handlers. A missing file fails with `BlobNotFoundError`.
 *
 * @see {@link Storage} for the storage API recommended for new code.
 * @category tags
 */
export const StorageReader = StorageReader_.StorageReader;
/**
 * Compatibility environment requirement for {@link StorageReader}; use
 * {@link Storage} in new code.
 *
 * @category context
 */
export type StorageReader = typeof StorageReader.Identifier;

/**
 * Compatibility tag for generating upload URLs and deleting stored files in
 * mutations, actions, and HTTP handlers. The service reports deletion failures as
 * `BlobNotFoundError`.
 *
 * @see {@link Storage} for the storage API recommended for new code.
 * @category tags
 */
export const StorageWriter = StorageWriter_.StorageWriter;
/**
 * Compatibility environment requirement for {@link StorageWriter}; use
 * {@link Storage} in new code.
 *
 * @category context
 */
export type StorageWriter = typeof StorageWriter.Identifier;

/**
 * Compatibility tag for reading and storing blobs in mutations, actions, and HTTP
 * handlers. A missing blob fails with `BlobNotFoundError`; storing a blob accepts
 * an optional SHA-256 checksum and returns a storage ID.
 *
 * @see {@link Storage} for the storage API recommended for new code.
 * @category tags
 */
export const StorageActionWriter = StorageActionWriter_.StorageActionWriter;
/**
 * Compatibility environment requirement for {@link StorageActionWriter}; use
 * {@link Storage} in new code.
 *
 * @category context
 */
export type StorageActionWriter = typeof StorageActionWriter.Identifier;

/**
 * Service tag for searching a table's vector index from actions or a schema-typed
 * HTTP router. Call the service with the table name, index, and search options to
 * get ranked document IDs and scores.
 *
 * **Gotchas**
 *
 * Results do not contain decoded documents. A Convex search failure is a defect.
 *
 * @public
 * @category tags
 */
export const VectorSearch: VectorSearch_.VectorSearchTag<
  DataModel.FromDatabaseSchema<typeof schemaDefinition>
> = VectorSearch_.VectorSearch<DataModel.FromDatabaseSchema<typeof schemaDefinition>>();
/**
 * Effect environment requirement for {@link VectorSearch}.
 *
 * @public
 * @category context
 */
export type VectorSearch = typeof VectorSearch.Identifier;

/**
 * Service tag for validating document IDs in queries and mutations. Use `parse` to
 * check a string against one table or `identify` to find its table among the
 * application's tables and Convex's system tables.
 *
 * **Gotchas**
 *
 * Both methods return `None` for an invalid ID. A match does not prove a document
 * exists.
 *
 * @public
 * @category tags
 */
export const DocumentIds: DocumentIds_.DocumentIdsTag<typeof schemaDefinition> = DocumentIds_.DocumentIds<typeof schemaDefinition>();
/**
 * Effect environment requirement for {@link DocumentIds}.
 *
 * @public
 * @category context
 */
export type DocumentIds = typeof DocumentIds.Identifier;

/**
 * Service tag for reading decoded documents in queries and mutations. Pass a
 * generated application table handle or a system table handle to `reader.table`.
 *
 * **Gotchas**
 *
 * A decoding failure is a typed `DocumentDecodeError`. Looking up a missing
 * document with `get(id)` fails with `GetByIdFailure` rather than returning an
 * empty result.
 *
 * @public
 * @category tags
 */
export const DatabaseReader: DatabaseReader_.DatabaseReaderTag<
  typeof schemaDefinition,
  Docs
> = DatabaseReader_.DatabaseReader<typeof schemaDefinition, Docs>();
/**
 * Effect environment requirement for {@link DatabaseReader}.
 *
 * @public
 * @category context
 */
export type DatabaseReader = typeof DatabaseReader.Identifier;

/**
 * Service tag for writing documents in mutations. Pass a generated application
 * table handle to `writer.table` to insert, patch, replace, or delete documents.
 * Inserts, patches, and replacements encode values through the table schema.
 *
 * @see {@link DatabaseReader} for reading application and system tables.
 * @public
 * @category tags
 */
export const DatabaseWriter: DatabaseWriter_.DatabaseWriterTag<
  typeof schemaDefinition,
  Docs
> = DatabaseWriter_.DatabaseWriter<typeof schemaDefinition, Docs>();
/**
 * Effect environment requirement for {@link DatabaseWriter}.
 *
 * @public
 * @category context
 */
export type DatabaseWriter = typeof DatabaseWriter.Identifier;

/**
 * Capability used by generated runners. Instead of yielding this tag, pass
 * transactionLimits to runQuery on the yielded QueryRunner in a query or mutation.
 * @internal
 */
export const QueryTransactionContext = QueryTransactionContext_.QueryTransactionContext;
/**
 * Internal requirement of runQuery with transactionLimits. Use the QueryRunner
 * from this module rather than importing the capability type.
 * @internal
 */
export type QueryTransactionContext = typeof QueryTransactionContext.Identifier;

/**
 * Capability used by generated runners in mutations. Instead of yielding this
 * tag, use runQuery with useStaleSnapshot or runMutation with transactionLimits
 * on the yielded QueryRunner or MutationRunner.
 * @internal
 */
export const MutationTransactionContext = MutationTransactionContext_.MutationTransactionContext;
/**
 * Internal requirement of runner options in mutations. Use runQuery or runMutation
 * on the yielded QueryRunner or MutationRunner rather than importing this type.
 * @internal
 */
export type MutationTransactionContext = typeof MutationTransactionContext.Identifier;

/**
 * Service tag for calling queries from queries, mutations, actions, and HTTP
 * handlers. Pass a query reference and decoded arguments to `runQuery` to get the
 * decoded result. Declared errors and `SchemaError` are typed failures.
 *
 * **Gotchas**
 *
 * Transaction limits require a query or mutation context. Supplying
 * `useStaleSnapshot`, even when false, requires a mutation.
 *
 * @category tags
 */
export const QueryRunner = QueryRunner_.QueryRunner;
/**
 * Effect environment requirement for {@link QueryRunner}.
 *
 * @category context
 */
export type QueryRunner = typeof QueryRunner.Identifier;

/**
 * Service tag for calling mutations from mutations, actions, and HTTP handlers.
 * Pass a mutation reference and decoded arguments to `runMutation` to get the
 * decoded result. Declared errors and `SchemaError` are typed failures.
 *
 * **Gotchas**
 *
 * Transaction limits require a mutation context. Omit the options when calling
 * from an action or HTTP handler.
 *
 * @category tags
 */
export const MutationRunner = MutationRunner_.MutationRunner;
/**
 * Effect environment requirement for {@link MutationRunner}.
 *
 * @category context
 */
export type MutationRunner = typeof MutationRunner.Identifier;

/**
 * Service tag for calling actions from actions and HTTP handlers. Pass an action
 * reference and decoded arguments to `runAction` to get the decoded result.
 * Declared errors and `SchemaError` are typed failures.
 *
 * @category tags
 */
export const ActionRunner = ActionRunner_.ActionRunner;
/**
 * Effect environment requirement for {@link ActionRunner}.
 *
 * @category context
 */
export type ActionRunner = typeof ActionRunner.Identifier;

/**
 * Service tag for the native Convex query context, typed to the application's
 * schema and available only in queries. Native reads return encoded document
 * values rather than Confect's decoded values.
 *
 * @public
 * @category tags
 */
export const QueryCtx: QueryCtx_.QueryCtxTag<
  DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>
> = QueryCtx_.QueryCtx<
  DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>
>();
/**
 * Effect environment requirement for {@link QueryCtx}.
 *
 * @public
 * @category context
 */
export type QueryCtx = typeof QueryCtx.Identifier;

/**
 * Service tag for the native Convex mutation context, typed to the application's
 * schema and available only in mutations. Native database operations use encoded
 * document values rather than Confect's decoded values.
 *
 * @public
 * @category tags
 */
export const MutationCtx: MutationCtx_.MutationCtxTag<
  DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>
> = MutationCtx_.MutationCtx<
  DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>
>();
/**
 * Effect environment requirement for {@link MutationCtx}.
 *
 * @public
 * @category context
 */
export type MutationCtx = typeof MutationCtx.Identifier;

/**
 * Service tag for the native Convex action context, typed to the application's
 * schema and available in actions. Native function calls use the wire
 * representations of arguments and results.
 *
 * @public
 * @category tags
 */
export const ActionCtx: ActionCtx_.ActionCtxTag<
  DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>
> = ActionCtx_.ActionCtx<
  DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<typeof schemaDefinition>>
>();
/**
 * Effect environment requirement for {@link ActionCtx}.
 *
 * @public
 * @category context
 */
export type ActionCtx = typeof ActionCtx.Identifier;
