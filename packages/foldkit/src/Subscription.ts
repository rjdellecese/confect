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
 * Failures delivered to a reactive query's `onError`: an error declared by the
 * ref or its middleware, a `WebSocketClientError` from the client, or a
 * `SchemaError` from encoding arguments or decoding a result.
 *
 * @category Errors
 */
export type Error<Query extends Ref.AnyConfectPublicQuery> =
  | Ref.Error<Query>
  | Client.WebSocketClientError
  | Schema.SchemaError;

const paginatedError = <Query extends Ref.AnyConfectPublicPaginatedQuery>(
  error: Error<Query>,
): PaginatedQuery.Error<Query> =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The public settlement type excludes FunctionError for refs with no declared errors; only a decoded ref error reaches that variant.
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
 * Arguments that determine whether a reactive query is subscribed. `None`
 * closes the subscription; a change to a different `Some` value opens a
 * listener with the new arguments.
 *
 * @category Models
 */
export interface Dependencies<Query extends Ref.AnyConfectPublicQuery> {
  /**
   * Decoded query args; None closes the subscription without changing Model
   * state.
   *
   * @category Models
   */
  readonly args: Option.Option<Ref.Args<Query>>;
}

/**
 * Callbacks that turn each decoded query result or typed failure into an
 * application Message. The subscription stream has no typed failure channel.
 *
 * @category Configuration
 */
export interface Handlers<
  Query extends Ref.AnyConfectPublicQuery,
  SuccessMessage,
  ErrorMessage,
> {
  /**
   * Maps a decoded server result to an application Message.
   *
   * @category Mapping
   */
  readonly onSuccess: (returns: Ref.Returns<Query>) => SuccessMessage;
  /**
   * Maps a declared, schema, or transport failure to an application Message.
   *
   * @category Mapping
   */
  readonly onError: (error: Error<Query>) => ErrorMessage;
}

/**
 * The `args` extractor is required whenever the query declares args; queries
 * without args may omit it, in which case the subscription is always open.
 *
 * @category Configuration
 */
type ArgsConfig<Query extends Ref.AnyConfectPublicQuery, Model> = {
  /**
   * Extracts decoded query arguments from the Model, or `None` to disable the
   * query.
   *
   * @category Configuration
   */
  readonly args?: (model: Model) => Option.Option<Ref.Args<Query>>;
} & (keyof Ref.Args<Query> extends never
  ? unknown
  : {
      /**
       * Extracts the decoded arguments for a query with argument fields.
       *
       * @category Configuration
       */
      readonly args: (model: Model) => Option.Option<Ref.Args<Query>>;
    });

/**
 * Creates a `dependenciesToStream` function for a hand-written Foldkit
 * subscription. It accepts decoded query arguments and emits an application
 * Message for each result or typed failure.
 *
 * **When to use**
 *
 * Use when a subscription tracks dependencies beyond the query arguments or has
 * its own rules for opening a listener.
 *
 * **Gotchas**
 *
 * If argument encoding fails, the stream emits one error Message and ends
 * without opening a listener. Once subscribed, a query failure can be followed
 * by a successful result.
 *
 * @category Subscriptions
 *
 * @param ref - Public Confect query ref; plain Convex refs lack the codecs
 *   required here.
 * @param handlers - Callbacks that convert decoded values and typed failures
 *   into Messages.
 *
 * @returns A function accepting decoded query arguments. It returns a scoped
 *   stream that requires `Client`, maps typed failures to Messages, and treats
 *   exceptions thrown by handlers as defects.
 *
 * @see {@link reactiveQuery} builds the complete subscription entry.
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
 * Creates a Foldkit subscription entry for a public Confect query. Supply the
 * Model type first, then the ref and callbacks that map query outcomes to
 * Messages.
 *
 * **Details**
 *
 * Pass the entry to Foldkit's `Subscription.make`. The `args` callback returns
 * `None` to close the listener or `Some` to subscribe. Foldkit compares
 * arguments using the ref's schema: equivalent arguments keep the listener
 * open; changed arguments replace it. For a query with no arguments, omitting
 * `args` keeps the listener open.
 *
 * **Example** (Watching a note only when its ID is selected)
 *
 * ```ts
 * import * as Confect from "@confect/foldkit";
 * import type { Id } from "confect/_generated/id";
 * import refs from "confect/_generated/refs";
 * import * as Option from "effect/Option";
 * import * as Schema from "effect/Schema";
 * import { defineMessageUnion } from "foldkit/message";
 * import * as Subscription from "foldkit/subscription";
 *
 * type Model = { readonly noteId: Option.Option<Id<"notes">> };
 * const get = refs.public.notes_and_random.notes.getOrFail;
 * const Message = defineMessageUnion({
 *   ReceivedNote: { note: get.returns },
 *   FailedGetNote: { message: Schema.String },
 * });
 * const subscriptions = Subscription.make<
 *   Model,
 *   typeof Message.Type,
 *   Confect.Client.Client
 * >()(() => ({
 *   note: Confect.Subscription.reactiveQuery<Model>()(get, {
 *     args: (model) => Option.map(model.noteId, (noteId) => ({ noteId })),
 *     onSuccess: (note) => Message.ReceivedNote({ note }),
 *     onError: (error) =>
 *       Message.FailedGetNote({ message: String(error) }),
 *   }),
 * }));
 * ```
 *
 * @category Subscriptions
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
            ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ArgsConfig requires an extractor for every ref with argument fields, so the default is always an empty record.
              Option.some({} as Ref.Args<Query>)
            : modelToArgs(model),
      }),
      dependenciesToStream: ({ args }) =>
        Option.match(args, {
          onNone: () => Stream.empty,
          onSome: (someArgs) => reactiveQueryStream(ref, config)(someArgs),
        }),
    };
  };

/**
 * Schema for the record of values Foldkit compares between Model updates.
 *
 * @category Schemas
 */
type DependenciesSchema<Dependencies_> = Schema.Schema<Dependencies_> & {
  /**
   * Struct fields required by Foldkit's subscription dependency schema.
   *
   * @category Schemas
   */
  readonly fields: Schema.Struct.Fields;
};

/**
 * Subscription entry that can keep a listener open across a dependency change.
 *
 * @category Models
 */
type EntryWithKeepAlive<Model, Message, Dependencies_, Services> = {
  /**
   * Schema used by Foldkit to compare and track the entry's dependencies.
   *
   * @category Schemas
   */
  readonly dependenciesSchema: DependenciesSchema<Dependencies_>;
  /**
   * Extracts the current logical request from the Model.
   *
   * @category Mapping
   */
  readonly modelToDependencies: (model: Model) => Dependencies_;
  /**
   * Compares requests without treating installation of the pagination ID as a
   * reason to restart the stream.
   *
   * @category Predicates
   */
  readonly keepAliveEquivalence: Equivalence.Equivalence<Dependencies_>;
  /**
   * Streams Messages for the request and releases its listener when the entry
   * closes or changes requests.
   *
   * @category Subscriptions
   */
  readonly dependenciesToStream: (
    dependencies: Dependencies_,
    readDependencies: () => Dependencies_,
  ) => Stream.Stream<Message, never, Services>;
};

/**
 * Creates a Foldkit subscription entry that follows one page of a pagination
 * machine. Supply the Model type first, then the machine, its state selector,
 * and a callback that wraps each settlement in a Message.
 *
 * **Details**
 *
 * An active machine subscribes to its current cursor range; navigation or a
 * split can change that range, and `Idle` closes it. The first settlement
 * carries the allocated pagination ID. Pass settlements to
 * `PaginatedQuery.settle` in `update` so a late success or failure cannot
 * replace a newer request's state.
 *
 * **Gotchas**
 *
 * A query failure can be followed by a success on the same listener.
 * Argument-encoding failure instead emits one failed settlement without opening
 * a listener. The stream requires `Client` and has no typed failures; an
 * exception thrown by `onSettled` is a defect.
 *
 * **Example** (Sending page settlements to a Foldkit Model)
 *
 * ```ts
 * import * as Confect from "@confect/foldkit";
 * import refs from "confect/_generated/refs";
 * import { defineMessageUnion } from "foldkit/message";
 * import * as Subscription from "foldkit/subscription";
 *
 * const Notes = Confect.PaginatedQuery.make(
 *   refs.public.notes_and_random.notes.listPaginated,
 * );
 * type Model = { readonly notes: typeof Notes.schema.Type };
 * const Message = defineMessageUnion({
 *   SettledGetNotesPage: { settlement: Notes.settlement },
 * });
 * const subscriptions = Subscription.make<
 *   Model,
 *   typeof Message.Type,
 *   Confect.Client.Client
 * >()(() => ({
 *   notesPage: Confect.Subscription.paginatedQuery<Model>()(Notes, {
 *     state: (model) => model.notes,
 *     onSettled: (settlement) =>
 *       Message.SettledGetNotesPage({ settlement }),
 *   }),
 * }));
 * ```
 *
 * @category Subscriptions
 *
 * @see {@link PaginatedQuery.settle} applies the emitted settlement to the Model.
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
       * Selects the machine state from the Model; `Idle` disables the page
       * subscription.
       *
       * @category Configuration
       */
      readonly state: (
        model: Model,
      ) => PaginatedQuery.State<
        PaginatedQuery.Item<PaginatedQueryRef>,
        PaginatedQuery.UserArgs<PaginatedQueryRef>,
        PaginatedQuery.Error<PaginatedQueryRef>
      >;
      /**
       * Wraps a correlated success or failure in a Message for
       * `PaginatedQuery.settle`.
       *
       * @category Mapping
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
       *
       * @category Models
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
                // oxlint-disable-next-line typescript/no-unsafe-assignment -- make validates against this ref's actual args codec; its public structural view erases the output to avoid expanding Struct on every ref lookup.
                const composedArgs: Ref.Args<PaginatedQueryRef> =
                  composedArgsSchema.make({
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
