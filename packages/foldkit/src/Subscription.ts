import * as Ref from "@confect/core/Ref";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type * as FoldkitSubscription from "foldkit/subscription";
import type * as PaginatedQuery from "./PaginatedQuery";
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
type ArgsConfig<
  Query extends Ref.AnyConfectPublicQuery,
  Model,
> = keyof Ref.Args<Query> extends never
  ? {
      readonly args?: (model: Model) => Option.Option<Ref.Args<Query>>;
    }
  : {
      readonly args: (model: Model) => Option.Option<Ref.Args<Query>>;
    };

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

const missingPaginatedProvenanceError = (ref: Ref.AnyConfect) =>
  new globalThis.Error(
    `Paginated query ref "${Ref.getConvexFunctionName(ref)}" was not built ` +
      "with `FunctionSpec.publicPaginatedQuery`. `Subscription.paginatedQuery` " +
      "derives its dependency equivalence and pagination options from the " +
      "schemas that constructor stores.",
  );

const paginatedArgsSchemaOrThrow = <
  Query extends Ref.AnyConfectPublicPaginatedQuery,
>(
  ref: Query,
): Ref.ArgsSchema<Query> => {
  if (ref.kind._tag !== "Paginated") {
    throw missingPaginatedProvenanceError(ref);
  }
  return ref.args as Ref.ArgsSchema<Query>;
};

/**
 * A complete Foldkit subscription entry for a Confect reactive query. Pass it
 * as an entry value to `Subscription.make`:
 *
 * ```ts
 * const subscriptions = Subscription.make<
 *   Model,
 *   Message,
 *   WebSocketClient.WebSocketClient
 * >()(() => ({
 *   note: Subscription.reactiveQuery(refs.public.notes.get, {
 *     args: (model: Model) =>
 *       Option.map(model.noteId, (noteId) => ({ noteId })),
 *     onSuccess: (note) => GotNote({ note }),
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
export const reactiveQuery = <
  Query extends Ref.AnyConfectPublicQuery,
  Model,
  SuccessMessage,
  ErrorMessage,
>(
  ref: Query,
  config: Handlers<Query, SuccessMessage, ErrorMessage> &
    ArgsConfig<Query, Model>,
): FoldkitSubscription.EntryWithoutKeepAlive<
  Model,
  SuccessMessage | ErrorMessage,
  Dependencies<Query>,
  WebSocketClient.WebSocketClient
> => {
  const modelToArgs = (
    config as {
      readonly args?: (model: Model) => Option.Option<Ref.Args<Query>>;
    }
  ).args;

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
        onSome: (someArgs) =>
          reactiveQueryStream(
            ref,
            config,
          )(...([someArgs] as Ref.OptionalArgs<Query>)),
      }),
  };
};

/**
 * A complete Foldkit subscription entry that keeps exactly one live reactive
 * page subscription in sync with a `PaginatedQuery` machine in the Model.
 * The machine state is the single source of truth: navigating, retrying, and
 * split-pinning change the derived args, which restarts the subscription;
 * a `Failed` machine (or a `None` from `state`) closes it.
 *
 * ```ts
 * const subscriptions = FoldkitSubscription.make<
 *   Model,
 *   Message,
 *   WebSocketClient.WebSocketClient
 * >()(() => ({
 *   notesPage: Subscription.paginatedQuery(refs.public.notes.paginate, {
 *     state: (model: Model) => model.notes,
 *     onResult: (result) => SettledNotesPage({ result }),
 *     onError: (error) => FailedNotesPage({ message: String(error) }),
 *   }),
 * }))
 * ```
 *
 * `onResult` receives a `PaginatedQuery.PageResult` — pass it to
 * `PaginatedQuery.settle` in `update`. Requires a ref built with
 * `FunctionSpec.publicPaginatedQuery`.
 */
export const paginatedQuery = <
  Query extends Ref.AnyConfectPublicPaginatedQuery,
  Model,
  ResultMessage,
  ErrorMessage,
>(
  ref: Query,
  config: {
    readonly state: (
      model: Model,
    ) => Option.Option<
      PaginatedQuery.State<
        PaginatedQuery.Item<Query>,
        PaginatedQuery.UserArgs<Query>
      >
    >;
    readonly onResult: (
      result: PaginatedQuery.PageResult<PaginatedQuery.Item<Query>>,
    ) => ResultMessage;
    readonly onError: (error: Error<Query>) => ErrorMessage;
  },
): FoldkitSubscription.EntryWithoutKeepAlive<
  Model,
  ResultMessage | ErrorMessage,
  Dependencies<Query>,
  WebSocketClient.WebSocketClient
> => {
  const composedArgsSchema = paginatedArgsSchemaOrThrow(ref);

  return {
    dependenciesSchema: Schema.Struct({
      args: Schema.Option(composedArgsSchema),
    }),
    modelToDependencies: (model) => ({
      args: Option.flatMap(config.state(model), (state) =>
        state.phase._tag === "Failed"
          ? Option.none()
          : Option.some({
              ...state.args,
              paginationOpts: {
                numItems: state.numItems,
                cursor: state.phase.current.cursor,
                ...Option.match(state.phase.current.endCursor, {
                  onNone: () => ({}),
                  onSome: (endCursor) => ({ endCursor }),
                }),
              },
            } as Ref.Args<Query>),
      ),
    }),
    dependenciesToStream: ({ args }) =>
      Option.match(args, {
        onNone: () => Stream.empty,
        onSome: (composedArgs) => {
          const { paginationOpts } =
            composedArgs as Ref.Args<Ref.AnyPublicPaginatedQuery>;
          const descriptor: PaginatedQuery.PageDescriptor = {
            cursor: paginationOpts.cursor,
            endCursor: Option.fromNullishOr(paginationOpts.endCursor),
          };
          return reactiveQueryStream(ref, {
            onSuccess: (returns) =>
              config.onResult({
                descriptor,
                ...(returns as Ref.Returns<Ref.AnyPublicPaginatedQuery>),
              }),
            onError: config.onError,
          })(...([composedArgs] as Ref.OptionalArgs<Query>));
        },
      }),
  };
};
