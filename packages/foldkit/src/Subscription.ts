import * as Ref from "@confect/core/Ref";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type * as FoldkitSubscription from "foldkit/subscription";
import * as WebSocketClient from "./WebSocketClient";

/**
 * Everything a reactive query subscription against `Query` can fail with.
 */
export type Error<Query extends Ref.AnyPublicQuery> =
  WebSocketClient.Error<Query>;

/**
 * The dependency record of a `reactiveQuery` entry. `None` means the
 * subscription is closed; a change from one `Some` to another tears the
 * server subscription down and reopens it with the new args.
 */
export interface Dependencies<Query extends Ref.AnyPublicQuery> {
  readonly args: Option.Option<Ref.Args<Query>>;
}

/**
 * Maps a reactive query's emissions into the app's Messages. Every failure —
 * the ref's typed error, a transport error, or a codec error — arrives via
 * `onError`, so the resulting stream's error channel is `never`, as Foldkit
 * requires.
 */
export interface Handlers<
  Query extends Ref.AnyPublicQuery,
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
  Query extends Ref.AnyPublicQuery,
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
 * dependencies, or a Convex-provenance ref).
 */
export const reactiveQueryStream =
  <Query extends Ref.AnyPublicQuery, SuccessMessage, ErrorMessage>(
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
    Stream.unwrap(
      Effect.map(WebSocketClient.WebSocketClient, (client) =>
        client.reactiveQuery(ref, ...args),
      ),
    ).pipe(
      Stream.map(handlers.onSuccess),
      Stream.catch((error) => Stream.succeed(handlers.onError(error))),
    );

const missingConfectProvenanceError = (ref: Ref.Any) =>
  new globalThis.Error(
    `Reactive query ref "${Ref.getConvexFunctionName(ref)}" was not built ` +
      "with `FunctionSpec.publicQuery`. `Subscription.reactiveQuery` derives " +
      "its dependency equivalence from the ref's args schema, which " +
      "Convex-provenance refs don't carry. Write the entry by hand with " +
      "`Subscription.reactiveQueryStream` instead.",
  );

/**
 * The slice of a ref's internal function spec the entry builder reads. The
 * `functionSpec` property is `@internal` on `Ref.Ref` and stripped from
 * `@confect/core`'s published declarations, hence the structural cast.
 */
interface WithFunctionProvenance {
  readonly functionSpec: {
    readonly functionProvenance:
      | { readonly _tag: "Confect"; readonly args: Schema.Codec<any, any> }
      | { readonly _tag: "Convex" };
  };
}

const argsSchemaOrThrow = (ref: Ref.AnyPublicQuery): Schema.Codec<any, any> => {
  const { functionProvenance } = (ref as unknown as WithFunctionProvenance)
    .functionSpec;
  if (functionProvenance._tag === "Convex") {
    throw missingConfectProvenanceError(ref);
  }
  return functionProvenance.args;
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
 *
 * Requires a ref built with `FunctionSpec.publicQuery` — for Convex-provenance
 * refs (which carry no args schema) write the entry by hand with
 * `reactiveQueryStream`.
 */
export const reactiveQuery = <
  Query extends Ref.AnyPublicQuery,
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
  const argsSchema = argsSchemaOrThrow(ref);
  const modelToArgs = (
    config as {
      readonly args?: (model: Model) => Option.Option<Ref.Args<Query>>;
    }
  ).args;

  return {
    dependenciesSchema: Schema.Struct({
      args: Schema.Option(argsSchema),
    }) as unknown as FoldkitSubscription.EntryWithoutKeepAlive<
      Model,
      SuccessMessage | ErrorMessage,
      Dependencies<Query>,
      WebSocketClient.WebSocketClient
    >["dependenciesSchema"],
    modelToDependencies: (model) => ({
      args:
        modelToArgs === undefined
          ? Option.some({} as Ref.Args<Query>)
          : modelToArgs(model),
    }),
    dependenciesToStream: ({ args }) =>
      Option.match(args, {
        onNone: () =>
          Stream.empty as Stream.Stream<
            SuccessMessage | ErrorMessage,
            never,
            WebSocketClient.WebSocketClient
          >,
        onSome: (someArgs) =>
          reactiveQueryStream(
            ref,
            config,
          )(...([someArgs] as Ref.OptionalArgs<Query>)),
      }),
  };
};
