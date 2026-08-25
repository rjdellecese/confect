import type * as Ref from "@confect/core/Ref";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type * as FoldkitSubscription from "foldkit/subscription";
import * as PaginatedQuery from "./PaginatedQuery";
import * as WebSocketClient from "./WebSocketClient";

/**
 * Everything a reactive query subscription against `Query` can fail with: the
 * ref's typed error (if it declares an `error` schema), a transport-level
 * `WebSocketClientError`, or a `SchemaError` from encoding args or decoding
 * returns.
 */
export type Error<Query extends Ref.AnyConfectPublicQuery> =
  | Ref.Error<Query>
  | WebSocketClient.WebSocketClientError
  | Schema.SchemaError;

/**
 * The dependency record of a `reactiveQuery` entry. `None` means the
 * subscription is closed; a change from one `Some` to another tears the
 * server subscription down and reopens it with the new args.
 */
export interface Dependencies<Query extends Ref.AnyConfectPublicQuery> {
  readonly args: Option.Option<Ref.Args<Query>>;
}

/**
 * Maps a reactive query's emissions into the app's Messages. Every failure —
 * the ref's typed error, a transport error, or a codec error — arrives via
 * `onError`, so the resulting stream's error channel is `never`, as Foldkit
 * requires.
 */
export interface Handlers<
  Query extends Ref.AnyConfectPublicQuery,
  SuccessMessage,
  ErrorMessage,
> {
  readonly onSuccess: (returns: Ref.Returns<Query>) => SuccessMessage;
  readonly onError: (error: Error<Query>) => ErrorMessage;
}

/**
 * The `args` extractor is required whenever the query declares args; queries
 * without args may omit it, in which case the subscription is always open.
 */
type ArgsConfig<Query extends Ref.AnyConfectPublicQuery, Model> = {
  readonly args?: (model: Model) => Option.Option<Ref.Args<Query>>;
} & (keyof Ref.Args<Query> extends never
  ? unknown
  : {
      readonly args: (model: Model) => Option.Option<Ref.Args<Query>>;
    });

/**
 * A `dependenciesToStream` body for a hand-written subscription entry: runs
 * the ref as a reactive query against the `WebSocketClient` resource and maps
 * every emission and every failure into a Message. The stream ends after
 * emitting the `onError` Message — Convex terminates the server subscription
 * on error — so retrying is `update`'s decision (typically by toggling the
 * entry's dependencies).
 *
 * Prefer `reactiveQuery`, which builds the whole entry; reach for this when
 * you need control over the entry's dependencies (custom gating, extra
 * dependencies).
 */
export const reactiveQueryStream =
  <Query extends Ref.AnyConfectPublicQuery, SuccessMessage, ErrorMessage>(
    ref: Query,
    handlers: Handlers<Query, SuccessMessage, ErrorMessage>,
  ) =>
  (
    ...args: Ref.OptionalArgs<Query>
  ): Stream.Stream<
    SuccessMessage | ErrorMessage,
    never,
    WebSocketClient.WebSocketClient
  > =>
    WebSocketClient.WebSocketClient.pipe(
      Effect.map((client) => client.reactiveQuery(ref, ...args)),
      Stream.unwrap,
      Stream.map(handlers.onSuccess),
      Stream.catch((error) => Stream.succeed(handlers.onError(error))),
    );

/**
 * A complete Foldkit subscription entry for a Confect reactive query. The
 * leading thunk fixes the `Model` type (TypeScript cannot partially infer
 * type arguments), so the `args` extractor's parameter is already typed.
 * Pass the result as an entry value to `Subscription.make`:
 *
 * ```ts
 * import * as Confect from "@confect/foldkit"
 * import * as Subscription from "foldkit/subscription"
 *
 * const subscriptions = Subscription.make<
 *   Model,
 *   Message,
 *   Confect.WebSocketClient.WebSocketClient
 * >()(() => ({
 *   note: Confect.Subscription.reactiveQuery<Model>()(refs.public.notes.get, {
 *     args: (model) => Option.map(model.noteId, (noteId) => ({ noteId })),
 *     onSuccess: (note) => SucceededGetNote({ note }),
 *     onError: (error) => FailedGetNote({ message: String(error) }),
 *   }),
 * }))
 * ```
 *
 * The entry's dependencies are the query args wrapped in `Option`: `None`
 * closes the subscription, a change from one `Some` to another unsubscribes
 * and resubscribes with the new args, and structurally equal args leave the
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
    WebSocketClient.WebSocketClient
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

/**
 * A complete Foldkit subscription entry that keeps exactly one live reactive
 * page subscription in sync with a `PaginatedQuery` machine in the Model.
 * The machine state is the single source of truth: navigating, retrying, and
 * split-pinning change the derived args, which restarts the subscription;
 * a `Failure` or `Stale` machine (or a `None` from `state`) closes it.
 *
 * The leading thunk fixes the `Model` type (TypeScript cannot partially
 * infer type arguments), so the `state` extractor's parameter is already
 * typed:
 *
 * ```ts
 * import * as Confect from "@confect/foldkit"
 * import * as Subscription from "foldkit/subscription"
 *
 * const subscriptions = Subscription.make<
 *   Model,
 *   Message,
 *   Confect.WebSocketClient.WebSocketClient
 * >()(() => ({
 *   notesPage: Confect.Subscription.paginatedQuery<Model>()(Notes, {
 *     state: (model) => model.notes,
 *     mapError: String,
 *     onSettled: (settlement) => SettledGetNotesPage({ settlement }),
 *   }),
 * }))
 * ```
 *
 * Pass the settlement to `PaginatedQuery.settle` in `update`. The request
 * identity is included in both success and failure Messages, so superseded
 * outcomes cannot settle a newer page or pagination session.
 */
export const paginatedQuery =
  <Model>() =>
  <
    PaginatedQueryRef extends Ref.AnyConfectPublicPaginatedQuery,
    Error_,
    SettledMessage,
  >(
    machine: PaginatedQuery.PaginatedQuery<PaginatedQueryRef, Error_>,
    config: {
      readonly state: (
        model: Model,
      ) => Option.Option<
        PaginatedQuery.State<
          PaginatedQuery.Item<PaginatedQueryRef>,
          PaginatedQuery.UserArgs<PaginatedQueryRef>,
          Error_
        >
      >;
      readonly mapError: (error: Error<PaginatedQueryRef>) => Error_;
      readonly onSettled: (
        settlement: PaginatedQuery.Settlement<
          PaginatedQuery.Item<PaginatedQueryRef>,
          PaginatedQuery.UserArgs<PaginatedQueryRef>,
          Error_
        >,
      ) => SettledMessage;
    },
  ): FoldkitSubscription.EntryWithoutKeepAlive<
    Model,
    SettledMessage,
    {
      readonly request: Option.Option<
        PaginatedQuery.Request<PaginatedQuery.UserArgs<PaginatedQueryRef>>
      >;
    },
    WebSocketClient.WebSocketClient
  > => {
    const ref = machine.ref;
    const composedArgsSchema = ref.args;

    return {
      dependenciesSchema: Schema.Struct({
        request: Schema.Option(machine.requestSchema),
      }),
      modelToDependencies: (model) => ({
        request: Option.flatMap(config.state(model), (state) =>
          Match.value(state.phase).pipe(
            Match.withReturnType<
              Option.Option<
                PaginatedQuery.Request<
                  PaginatedQuery.UserArgs<PaginatedQueryRef>
                >
              >
            >(),
            Match.tag("Failure", "Stale", () => Option.none()),
            Match.tag("Loading", "Refreshing", "Success", () =>
              Option.some(PaginatedQuery.getRequest(state)),
            ),
            Match.exhaustive,
          ),
        ),
      }),
      dependenciesToStream: ({ request }) =>
        Option.match(request, {
          onNone: () => Stream.empty,
          onSome: (pageRequest) => {
            const { descriptor, options, paginationId } = pageRequest;
            const composedArgs = composedArgsSchema.make({
              ...pageRequest.args,
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
            return reactiveQueryStream(ref, {
              onSuccess: (returns) =>
                config.onSettled({
                  request: pageRequest,
                  result: Result.succeed(returns),
                }),
              onError: (error) =>
                config.onSettled({
                  request: pageRequest,
                  result: Result.fail(config.mapError(error)),
                }),
            })(composedArgs);
          },
        }),
    };
  };
