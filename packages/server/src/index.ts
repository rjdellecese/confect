/**
 * Client layer that authenticates Effect AI decision requests with the Convex
 * AI gateway, and the errors it can return when built.
 *
 * @category AI
 */
export * as AiGatewayDecisionClient from "./AiGatewayDecisionClient";
/**
 * Model descriptors and layers for making structured decisions through the
 * Convex AI gateway.
 *
 * @category AI
 */
export * as AiGatewayDecisionModel from "./AiGatewayDecisionModel";
/**
 * Client layer that authenticates Effect AI language-model requests with the
 * Convex AI gateway, and the errors it can return when built.
 *
 * @category AI
 */
export * as AiGatewayLanguageClient from "./AiGatewayLanguageClient";
/**
 * Language-model descriptors and request overrides for generating or streaming
 * text through the Convex AI gateway.
 *
 * @category AI
 */
export * as AiGatewayLanguageModel from "./AiGatewayLanguageModel";
/**
 * Native Convex action context available through the generated `ActionCtx` tag.
 *
 * @category Invocation
 */
export * as ActionCtx from "./ActionCtx";
/**
 * Action invocation through the generated `ActionRunner` service.
 *
 * @category Invocation
 */
export * as ActionRunner from "./ActionRunner";
/**
 * Identity lookups through the generated `Auth` service, including the failure
 * for a missing identity.
 *
 * @category Authentication
 */
export * as Auth from "./Auth";
/**
 * Tagged error identifying the blob that a read could not find or a delete
 * could not remove.
 *
 * @category Storage
 */
export * as BlobNotFoundError from "./BlobNotFoundError";
/**
 * Configuration provider for exact environment-key lookups in the Convex
 * runtime.
 *
 * @category Configuration
 */
export * as ConvexConfigProvider from "./ConvexConfigProvider";
/**
 * @internal
 */
export * as ConvexFunctionDefinitions from "./ConvexFunctionDefinitions";
/**
 * Effect logger and layer for sending structured logs to the Convex console.
 *
 * @category Logging
 */
export * as ConvexLogger from "./ConvexLogger";
/**
 * Job descriptions that pair a recurring schedule with a mutation or action and
 * its arguments.
 *
 * @category Scheduling
 */
export * as CronJob from "./CronJob";
/**
 * Immutable collections of recurring jobs to default-export from
 * `confect/crons.ts`.
 *
 * @category Scheduling
 */
export * as CronJobs from "./CronJobs";
/**
 * Recurring UTC windows for jobs that can run at any minute within the chosen
 * hour.
 *
 * @category Scheduling
 */
export * as CronWindow from "./CronWindow";
/**
 * Schema-typed table reads through the generated `DatabaseReader` service in
 * queries and mutations.
 *
 * @category Database
 */
export * as DatabaseReader from "./DatabaseReader";
/**
 * ID parsing and table identification against the application's schema.
 *
 * @category Database
 */
export * as DocumentIds from "./DocumentIds";
/**
 * Database schema and access to its full registry of application table handles.
 *
 * @category Database
 */
export * as DatabaseSchema from "./DatabaseSchema";
/**
 * Schema-typed table writes through the generated `DatabaseWriter` service in
 * mutations.
 *
 * @category Database
 */
export * as DatabaseWriter from "./DatabaseWriter";
/**
 * @internal
 */
export * as DataModel from "./DataModel";
/**
 * Decoded document types and errors that identify failures to encode or decode
 * database documents.
 *
 * @category Database
 */
export * as Document from "./Document";
/**
 * Metadata for the current function and deployment, read through the generated
 * `ExecutionMetadata` tag.
 *
 * @category Metadata
 */
export * as ExecutionMetadata from "./ExecutionMetadata";
/**
 * Layers that implement individual group functions. Use the builder from
 * `_generated/server` to type handlers against the application schema.
 *
 * @category Function implementation
 */
export * as FunctionImpl from "./FunctionImpl";
/**
 * @internal
 */
export * as FunctionRegistryItem from "./FunctionRegistryItem";
/**
 * Layers that assemble function and middleware implementations into a finalized
 * group for code generation.
 *
 * @category Function implementation
 */
export * as GroupImpl from "./GroupImpl";
/**
 * @internal
 */
export * as Handler from "./Handler";
/**
 * Router for mounting Effect HTTP routes on a native Convex HTTP router.
 *
 * @category HTTP
 */
export * as HttpRouter from "./HttpRouter";
/**
 * Layers that implement declared middleware with a shared wrapper or a wrapper
 * for each function type.
 *
 * @category Middleware
 */
export * as MiddlewareImpl from "./MiddlewareImpl";
/**
 * @internal
 */
export * as MiddlewareRegistryItem from "./MiddlewareRegistryItem";
/**
 * JWT signing with the deployment's signing key through the mutation-only
 * `MutationAuth` service.
 *
 * @category Authentication
 */
export * as MutationAuth from "./MutationAuth";
/**
 * Native Convex mutation context available through the generated `MutationCtx`
 * tag.
 *
 * @category Invocation
 */
export * as MutationCtx from "./MutationCtx";
/**
 * Mutation invocation and nested transaction-limit options through the
 * generated `MutationRunner` service.
 *
 * @category Invocation
 */
export * as MutationRunner from "./MutationRunner";
/**
 * @internal
 */
export * as MutationTransactionContext from "./MutationTransactionContext";
/**
 * Operations for reading decoded documents from ordered index and search
 * queries.
 *
 * @category Database
 */
export * as OrderedQuery from "./OrderedQuery";
/**
 * Native Convex query context available through the generated `QueryCtx` tag.
 *
 * @category Invocation
 */
export * as QueryCtx from "./QueryCtx";
/**
 * Per-table operations for ID lookups, index scans, searches, and composable
 * query streams.
 *
 * @category Database
 */
export * as QueryInitializer from "./QueryInitializer";
/**
 * Query invocation and nested transaction controls through the generated
 * `QueryRunner` service.
 *
 * @category Invocation
 */
export * as QueryRunner from "./QueryRunner";
/**
 * @internal
 */
export * as QueryTransactionContext from "./QueryTransactionContext";
/**
 * Experimental database streams that preserve index order and support
 * composition and pagination.
 *
 * @category Database
 *
 * @experimental
 */
export * as QueryStream from "./QueryStream";
/**
 * @experimental
 *
 * @internal
 */
export * as QueryStreamCursor from "./QueryStreamCursor";
/**
 * @experimental
 *
 * @internal
 */
export * as QueryStreamKeyLabels from "./QueryStreamKeyLabels";
/**
 * @experimental
 *
 * @internal
 */
export * as QueryStreamKeyLayout from "./QueryStreamKeyLayout";
/**
 * @experimental
 *
 * @internal
 */
export * as QueryStreamOrderDirection from "./QueryStreamOrderDirection";
/**
 * @experimental
 *
 * @internal
 */
export * as QueryStreamKeyValues from "./QueryStreamKeyValues";
/**
 * @experimental
 *
 * @internal
 */
export * as QueryStreamKeyBounds from "./QueryStreamKeyBounds";
/**
 * @experimental
 *
 * @internal
 */
export * as QueryStreamIndexRange from "./QueryStreamIndexRange";
/**
 * @experimental
 *
 * @internal
 */
export * as QueryStreamReadBudget from "./QueryStreamReadBudget";
/**
 * @internal
 */
export * as RegisteredConvexFunction from "./RegisteredConvexFunction";
/**
 * @internal
 */
export * as RegisteredFunction from "./RegisteredFunction";
/**
 * @internal
 */
export * as RegisteredFunctions from "./RegisteredFunctions";
/**
 * @internal
 */
export * as Registry from "./Registry";
/**
 * @internal
 */
export * as RegistryItems from "./RegistryItems";
/**
 * @internal
 */
export * as ResolvedMiddleware from "./ResolvedMiddleware";
/**
 * Metadata for the request that triggered a mutation, action, or HTTP handler.
 *
 * @category Metadata
 */
export * as RequestMetadata from "./RequestMetadata";
/**
 * One-off scheduling and cancellation of mutations and actions through the
 * generated `Scheduler` service.
 *
 * @category Scheduling
 */
export * as Scheduler from "./Scheduler";
/**
 * Blob operations through the generated `Storage` service. Each operation
 * declares which function contexts can use it.
 *
 * @category Storage
 */
export * as Storage from "./Storage";
/**
 * Compatibility service for reading and storing blob contents. Prefer the
 * generated `Storage` tag in application code.
 *
 * @category Storage
 */
export * as StorageActionWriter from "./StorageActionWriter";
/**
 * Compatibility service for looking up download URLs. Prefer the generated
 * `Storage` tag in application code.
 *
 * @category Storage
 */
export * as StorageReader from "./StorageReader";
/**
 * Compatibility service for creating upload URLs and deleting blobs. Prefer the
 * generated `Storage` tag in application code.
 *
 * @category Storage
 */
export * as StorageWriter from "./StorageWriter";
/**
 * Convex system-table handles and re-exports of core table types. Define
 * application tables with `@confect/core/Table`.
 *
 * @category Database
 */
export * as Table from "./Table";
/**
 * @internal
 */
export * as TableInfo from "./TableInfo";
/**
 * Current transaction metrics and the snapshot timestamp for queries and
 * mutations.
 *
 * @category Metadata
 */
export * as TransactionMetadata from "./TransactionMetadata";
/**
 * Vector-index searches through the generated `VectorSearch` service in
 * actions, returning ranked document IDs and scores.
 *
 * @category Database
 */
export * as VectorSearch from "./VectorSearch";
