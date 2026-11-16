import * as PaginationError from "@confect/core/PaginationError";
import type * as Ref from "@confect/core/Ref";
import * as Effect from "effect/Effect";
import type * as Equivalence from "effect/Equivalence";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type * as FoldkitSubscription from "foldkit/subscription";
import * as PaginatedQuery from "./PaginatedQuery";
import * as Client from "./Client";

/**
 * Everything a reactive query subscription against `Query` can fail with: the
 * ref's typed error (if it declares an `error` schema), a transport-level
 * `WebSocketClientError`, or a `SchemaError` from encoding args or decoding
 * returns.
 */
export type Error<Query extends Ref.AnyConfectPublicQuery> =
  | Ref.Error<Query>
  | Client.WebSocketClientError
  | Schema.SchemaError;

const paginatedError = <Query extends Ref.AnyConfectPublicPaginatedQuery>(
  error: Error<Query>,
): PaginatedQuery.Error<Query> =>
  Match.value(error).pipe(
    Match.when(Schema.isSchemaError, (schemaError) => schemaError),
    Match.when(Match.instanceOf(Client.WebSocketClientError), (clientError) =>
      PaginationError.fromConvexQueryError(clientError.cause).pipe(
        Option.getOrElse(() => clientError),
      ),
    ),
    Match.when(Match.any, (functionError) =>
      PaginationError.fromConvexErrorData(functionError).pipe(
        Option.getOrElse(() =>
          PaginatedQuery.FunctionError({ error: functionError }),
        ),
      ),
    ),
    Match.exhaustive,
  ) as PaginatedQuery.Error<Query>;

/**
 * The dependency record of a `reactiveQuery` entry. `None` means the
 * subscription is closed; a change from one `Some` to another tears the server
 * subscription down and reopens it with the new args.
 */
export interface Dependencies<Query extends Ref.AnyConfectPublicQuery> {
  /**
   * Decoded query args; None closes the subscription without changing Model
   * state.
   */
  readonly args: Option.Option<Ref.Args<Query>>;
}

/**
 * Maps a reactive query's emissions into the app's Messages. Every failure—the
 * ref's typed error, a transport error, or a codec error—arrives via `onError`,
 * so the resulting stream's error channel is `never`, as Foldkit requires.
 */
export interface Handlers<
  Query extends Ref.AnyConfectPublicQuery,
  SuccessMessage,
  ErrorMessage,
> {
  /**
   * Map each decoded server result to an application Message.
   */
  readonly onSuccess: (returns: Ref.Returns<Query>) => SuccessMessage;
  /**
   * Map a declared, schema or transport failure to a Message without closing
   * the listener.
   */
  readonly onError: (error: Error<Query>) => ErrorMessage;
}

/**
 * The `args` extractor is required whenever the query declares args; queries
 * without args may omit it, in which case the subscription is always open.
 */
type ArgsConfig<Query extends Ref.AnyConfectPublicQuery, Model> = {
  /**
   * Extract decoded args from Model; None disables the query.
   */
  readonly args?: (model: Model) => Option.Option<Ref.Args<Query>>;
} & (keyof Ref.Args<Query> extends never
  ? unknown
  : {
      /**
       * Required model extractor for a query with argument fields.
       */
      readonly args: (model: Model) => Option.Option<Ref.Args<Query>>;
    });

/**
 * A `dependenciesToStream` body for a hand-written subscription entry: runs the
 * ref as a reactive query against the `Client` resource and maps every emission
 * and every failure into a Message. Query failures are values, so the
 * subscription remains live and can later emit a successful result.
 *
 * Prefer `reactiveQuery`, which builds the whole entry; reach for this when you
 * need control over the entry's dependencies (custom gating, extra
 * dependencies).
 *
 * @param ref - Public Confect query ref; plain Convex refs lack the codecs
 *   required here.
 * @param handlers - Convert decoded values and failures into Messages.
 *
 * @returns A function accepting decoded query args and returning a scoped
 *   stream requiring Client. Typed failures become Messages; exceptions in
 *   handlers are defects. An argument-encoding failure emits one error Message
 *   and ends before a listener is registered.
 */
export const reactiveQueryStream =
  <Query extends Ref.AnyConfectPublicQuery, SuccessMessage, ErrorMessage>(
    ref: Query,
    handlers: Handlers<Query, SuccessMessage, ErrorMessage>,
  ) =>
  (
    ...args: Ref.OptionalArgs<Query>
  ): Stream.Stream<SuccessMessage | ErrorMessage, never, Client.Client> =>
    Client.Client.pipe(
      Effect.map((client) => client.reactiveQueryResult(ref, ...args)),
      Stream.unwrap,
      Stream.map(
        Result.match({
          onSuccess: handlers.onSuccess,
          onFailure: handlers.onError,
        }),
      ),
    );

/**
 * A complete Foldkit subscription entry for a Confect reactive query. The
 * leading thunk fixes the `Model` type (TypeScript cannot partially infer type
 * arguments), so the `args` extractor's parameter is already typed. Pass the
 * result as an entry value to `Subscription.make`:
 *
 * ```ts
 * import * as Confect from "@confect/foldkit";
 * import * as Subscription from "foldkit/subscription";
 *
 * const subscriptions = Subscription.make<
 *   Model,
 *   Message,
 *   Confect.Client.Client
 * >()(() => ({
 *   note: Confect.Subscription.reactiveQuery<Model>()(
 *     refs.public.notes.get,
 *     {
 *       args: (model) =>
 *         Option.map(model.noteId, (noteId) => ({ noteId })),
 *       onSuccess: (note) => SucceededGetNote({ note }),
 *       onError: (error) => FailedGetNote({ message: String(error) }),
 *     },
 *   ),
 * }));
 * ```
 *
 * The entry's dependencies are the query args wrapped in `Option`: `None`
 * closes the subscription, a change from one `Some` to another unsubscribes and
 * resubscribes with the new args, and structurally equal args leave the
 * subscription running (equivalence is derived from the ref's args schema).
 * Queries without args may omit `args`, leaving the subscription always open.
 */
export const reactiveQuery =
  <Model>() =>
  <Query extends Ref.AnyConfectPublicQuery, SuccessMessage, ErrorMessage>(
    ref: Query,
    config: Handlers<Query, SuccessMessage, ErrorMessage> &
      ArgsConfig<Query, Model>,
  ): FoldkitSubscription.EntryWithoutKeepAlive<
    Model,
    SuccessMessage | ErrorMessage,
    Dependencies<Query>,
    Client.Client
  > => {
    const modelToArgs = config.args;

    return {
      dependenciesSchema: Schema.Struct({
        args: Schema.Option(ref.args),
      }),
      modelToDependencies: (model) => ({
        args:
          modelToArgs === undefined
            ? Option.some({} as Ref.Args<Query>)
            : modelToArgs(model),
      }),
      dependenciesToStream: ({ args }) =>
        Option.match(args, {
          onNone: () => Stream.empty,
          onSome: (someArgs) => reactiveQueryStream(ref, config)(someArgs),
        }),
    };
  };

type DependenciesSchema<Dependencies_> = Schema.Schema<Dependencies_> & {
  /**
   * Struct fields required by Foldkit's subscription dependency schema.
   */
  readonly fields: Schema.Struct.Fields;
};

type EntryWithKeepAlive<Model, Message, Dependencies_, Services> = {
  /**
   * Schema used by Foldkit to compare and track the entry's dependencies.
   */
  readonly dependenciesSchema: DependenciesSchema<Dependencies_>;
  /**
   * Extract the current logical request from Model.
   */
  readonly modelToDependencies: (model: Model) => Dependencies_;
  /**
   * Ignore newly installed pagination ids when deciding whether to restart the
   * stream.
   */
  readonly keepAliveEquivalence: Equivalence.Equivalence<Dependencies_>;
  /**
   * Stream Messages for the request; closing or replacing the entry releases
   * its listener.
   */
  readonly dependenciesToStream: (
    dependencies: Dependencies_,
    readDependencies: () => Dependencies_,
  ) => Stream.Stream<Message, never, Services>;
};

/**
 * A complete Foldkit subscription entry that keeps exactly one live reactive
 * page subscription in sync with a `PaginatedQuery` machine in the Model. The
 * machine state is the single source of truth: navigation and split-pinning
 * change the derived args, while `Idle` closes the subscription. Pagination ids
 * are allocated here and installed by the first settlement.
 *
 * The leading thunk fixes the `Model` type (TypeScript cannot partially infer
 * type arguments), so the `state` extractor's parameter is already typed:
 *
 * ```ts
 * import * as Confect from "@confect/foldkit";
 * import * as Subscription from "foldkit/subscription";
 *
 * const subscriptions = Subscription.make<
 *   Model,
 *   Message,
 *   Confect.Client.Client
 * >()(() => ({
 *   notesPage: Confect.Subscription.paginatedQuery<Model>()(Notes, {
 *     state: (model) => model.notes,
 *     onSettled: (settlement) => SettledGetNotesPage({ settlement }),
 *   }),
 * }));
 * ```
 *
 * Pass the settlement to `PaginatedQuery.settle` in `update`. The request
 * identity is included in both success and failure Messages, so superseded
 * outcomes cannot settle a newer page or pagination session. Query failures do
 * not close the Convex subscription; a later result can recover naturally. An
 * argument-codec failure emits one failed settlement before any listener is
 * registered. The resulting stream requires Client and has no typed failures;
 * exceptions thrown by onSettled remain defects.
 */
export const paginatedQuery =
  <Model>() =>
  <
    PaginatedQueryRef extends Ref.AnyConfectPublicPaginatedQuery,
    SettledMessage,
  >(
    machine: PaginatedQuery.PaginatedQuery<PaginatedQueryRef>,
    config: {
      /**
       * Select the machine state; Idle disables the page subscription.
       */
      readonly state: (
        model: Model,
      ) => PaginatedQuery.State<
        PaginatedQuery.Item<PaginatedQueryRef>,
        PaginatedQuery.UserArgs<PaginatedQueryRef>,
        PaginatedQuery.Error<PaginatedQueryRef>
      >;
      /**
       * Wrap a correlated success or failure in a Message for
       * PaginatedQuery.settle.
       */
      readonly onSettled: (
        settlement: PaginatedQuery.Settlement<
          PaginatedQuery.Item<PaginatedQueryRef>,
          PaginatedQuery.UserArgs<PaginatedQueryRef>,
          PaginatedQuery.Error<PaginatedQueryRef>
        >,
      ) => SettledMessage;
    },
  ): EntryWithKeepAlive<
    Model,
    SettledMessage,
    {
      /**
       * Current logical request, or None while the machine is Idle.
       */
      readonly request: Option.Option<
        PaginatedQuery.SubscriptionRequest<
          PaginatedQuery.UserArgs<PaginatedQueryRef>
        >
      >;
    },
    Client.Client
  > => {
    const ref = machine.ref;
    const composedArgsSchema = ref.args;
    const requestEquivalence = Schema.toEquivalence(
      machine.subscriptionRequestSchema,
    );
    const optionalRequestEquivalence = Option.makeEquivalence<
      PaginatedQuery.SubscriptionRequest<
        PaginatedQuery.UserArgs<PaginatedQueryRef>
      >
    >((left, right) =>
      requestEquivalence(
        { ...left, paginationId: Option.none() },
        { ...right, paginationId: Option.none() },
      ),
    );

    return {
      dependenciesSchema: Schema.Struct({
        request: Schema.Option(machine.subscriptionRequestSchema),
      }),
      modelToDependencies: (model) => ({
        request: Match.value(config.state(model)).pipe(
          Match.tag("Idle", () => Option.none()),
          Match.tag("Active", (state) =>
            Option.some(PaginatedQuery.getSubscriptionRequest(state)),
          ),
          Match.exhaustive,
        ),
      }),
      keepAliveEquivalence: (left, right) =>
        optionalRequestEquivalence(left.request, right.request),
      dependenciesToStream: ({
        request,
      }): Stream.Stream<SettledMessage, never, Client.Client> =>
        Option.match(request, {
          onNone: () => Stream.empty,
          onSome: (subscriptionRequest) =>
            Stream.unwrap(
              Effect.gen(function* () {
                const client = yield* Client.Client;
                const paginationId = yield* client.resolvePaginationId(
                  subscriptionRequest.paginationId,
                );
                const allocatedRequest = PaginatedQuery.allocateRequest(
                  subscriptionRequest,
                  paginationId,
                );
                const { descriptor, options } = allocatedRequest;
                const composedArgs = composedArgsSchema.make({
                  ...allocatedRequest.args,
                  paginationOpts: {
                    numItems: options.initialNumItems,
                    cursor: descriptor.cursor,
                    id: paginationId,
                    ...Match.value(options.maximumRowsRead).pipe(
                      Match.when(undefined, () => ({})),
                      Match.when(Match.defined, (maximumRowsRead) => ({
                        maximumRowsRead,
                      })),
                      Match.exhaustive,
                    ),
                    ...Match.value(options.maximumBytesRead).pipe(
                      Match.when(undefined, () => ({})),
                      Match.when(Match.defined, (maximumBytesRead) => ({
                        maximumBytesRead,
                      })),
                      Match.exhaustive,
                    ),
                    ...Option.match(descriptor.endCursor, {
                      onNone: () => ({}),
                      onSome: (endCursor) => ({ endCursor }),
                    }),
                  },
                });
                return client.reactiveQueryResult(ref, composedArgs).pipe(
                  Stream.map((result) =>
                    config.onSettled({
                      request: allocatedRequest,
                      result: Result.mapError(result, paginatedError),
                    }),
                  ),
                );
              }),
            ),
        }),
    };
  };
