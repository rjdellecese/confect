import type * as Ref from "@confect/core/Ref";
import * as Effect from "effect/Effect";
import * as FoldkitCommand from "foldkit/command";
import * as WebSocketClient from "./WebSocketClient";

/**
 * Everything a Command against `Ref_` can fail with before it is folded into
 * an `onError` Message.
 */
export type Error<Ref_ extends Ref.Any> = WebSocketClient.Error<Ref_>;

/**
 * Maps a Confect function's outcome into the app's Messages. Every failure —
 * the ref's typed error, a transport error, or a codec error — arrives via
 * `onError`, so the resulting Command's error channel is `never`, as Foldkit
 * requires. Follow Foldkit's naming convention: past-tense facts like
 * `SucceededSaveNote` / `FailedSaveNote`.
 */
export interface Handlers<Ref_ extends Ref.Any, SuccessMessage, ErrorMessage> {
  readonly onSuccess: (returns: Ref.Returns<Ref_>) => SuccessMessage;
  readonly onError: (error: Error<Ref_>) => ErrorMessage;
}

/**
 * A Foldkit Command definition whose args are the ref's args. Carries the
 * `CommandDefinitionTypeId` brand, so it is assignable to Foldkit's
 * `CommandDefinition` and matchable in Story/Scene tests. Call it from
 * `update` — with the ref's args, or with none when the ref declares none —
 * to construct a Command instance; nothing runs until the Foldkit runtime
 * executes it.
 */
export interface Definition<
  Name extends string,
  Ref_ extends Ref.Any,
  Message,
> {
  readonly [FoldkitCommand.CommandDefinitionTypeId]: FoldkitCommand.CommandDefinitionTypeId;
  readonly name: Name;
  (
    ...args: Ref.OptionalArgs<Ref_>
  ): FoldkitCommand.Command<Message, never, WebSocketClient.WebSocketClient>;
}

const run = <Ref_ extends Ref.Any, SuccessMessage, ErrorMessage>(
  handlers: Handlers<Ref_, SuccessMessage, ErrorMessage>,
  invoke: (
    client: WebSocketClient.WebSocketClient,
  ) => Effect.Effect<Ref.Returns<Ref_>, Error<Ref_>>,
): Effect.Effect<
  SuccessMessage | ErrorMessage,
  never,
  WebSocketClient.WebSocketClient
> =>
  Effect.flatMap(WebSocketClient.WebSocketClient, invoke).pipe(
    Effect.match({
      onSuccess: handlers.onSuccess,
      onFailure: handlers.onError,
    }),
  );

/**
 * An execute body for a hand-written `Command.define` — every failure already
 * folded into a Message. Reach for these when the factory below doesn't fit:
 * a custom args schema, `interrupt`, or a Command that makes several calls.
 */
export const queryEffect =
  <Query extends Ref.AnyPublicQuery, SuccessMessage, ErrorMessage>(
    ref: Query,
    handlers: Handlers<Query, SuccessMessage, ErrorMessage>,
  ) =>
  (
    ...args: Ref.OptionalArgs<Query>
  ): Effect.Effect<
    SuccessMessage | ErrorMessage,
    never,
    WebSocketClient.WebSocketClient
  > =>
    run(handlers, (client) => client.query(ref, ...args));

/**
 * An execute body for a hand-written `Command.define` — every failure already
 * folded into a Message. See `queryEffect`.
 */
export const mutationEffect =
  <Mutation extends Ref.AnyPublicMutation, SuccessMessage, ErrorMessage>(
    ref: Mutation,
    handlers: Handlers<Mutation, SuccessMessage, ErrorMessage>,
  ) =>
  (
    ...args: Ref.OptionalArgs<Mutation>
  ): Effect.Effect<
    SuccessMessage | ErrorMessage,
    never,
    WebSocketClient.WebSocketClient
  > =>
    run(handlers, (client) => client.mutation(ref, ...args));

/**
 * An execute body for a hand-written `Command.define` — every failure already
 * folded into a Message. See `queryEffect`.
 */
export const actionEffect =
  <Action extends Ref.AnyPublicAction, SuccessMessage, ErrorMessage>(
    ref: Action,
    handlers: Handlers<Action, SuccessMessage, ErrorMessage>,
  ) =>
  (
    ...args: Ref.OptionalArgs<Action>
  ): Effect.Effect<
    SuccessMessage | ErrorMessage,
    never,
    WebSocketClient.WebSocketClient
  > =>
    run(handlers, (client) => client.action(ref, ...args));

const makeDefinition = <
  Name extends string,
  Ref_ extends Ref.Any,
  SuccessMessage,
  ErrorMessage,
>(
  name: Name,
  runWithArgs: (
    ...args: Ref.OptionalArgs<Ref_>
  ) => Effect.Effect<
    SuccessMessage | ErrorMessage,
    never,
    WebSocketClient.WebSocketClient
  >,
): Definition<Name, Ref_, SuccessMessage | ErrorMessage> =>
  // Delegating to Foldkit's `define` keeps the `CommandDefinitionTypeId`
  // brand, the `Effect.suspend` around `execute`, and the `messageMappers`
  // chain that Story/Scene test resolution replays. `messages` is typing-only
  // and `args` is only checked for presence, so the casts don't change
  // runtime behavior — they substitute the ref-derived call signature for the
  // schema-derived one `define` would declare.
  FoldkitCommand.define(name, {
    args: {},
    messages: [],
    execute: (args: Ref.Args<Ref_> | undefined) =>
      runWithArgs(
        ...((args === undefined ? [] : [args]) as Ref.OptionalArgs<Ref_>),
      ),
  } as never) as never;

/**
 * A Foldkit Command definition for a Confect query whose Command args are the
 * ref's args:
 *
 * ```ts
 * const FetchNote = Command.query("FetchNote", refs.public.notes.get, {
 *   onSuccess: (note) => GotNote({ note }),
 *   onError: (error) => FailedGetNote({ message: String(error) }),
 * })
 * // In update:
 * // [model, [FetchNote({ noteId })]]
 * ```
 */
export const query = <
  const Name extends string,
  Query extends Ref.AnyPublicQuery,
  SuccessMessage,
  ErrorMessage,
>(
  name: Name,
  ref: Query,
  handlers: Handlers<Query, SuccessMessage, ErrorMessage>,
): Definition<Name, Query, SuccessMessage | ErrorMessage> =>
  makeDefinition(name, queryEffect(ref, handlers));

/**
 * A Foldkit Command definition for a Confect mutation whose Command args are
 * the ref's args. See `query`.
 */
export const mutation = <
  const Name extends string,
  Mutation extends Ref.AnyPublicMutation,
  SuccessMessage,
  ErrorMessage,
>(
  name: Name,
  ref: Mutation,
  handlers: Handlers<Mutation, SuccessMessage, ErrorMessage>,
): Definition<Name, Mutation, SuccessMessage | ErrorMessage> =>
  makeDefinition(name, mutationEffect(ref, handlers));

/**
 * A Foldkit Command definition for a Confect action whose Command args are
 * the ref's args. See `query`.
 */
export const action = <
  const Name extends string,
  Action extends Ref.AnyPublicAction,
  SuccessMessage,
  ErrorMessage,
>(
  name: Name,
  ref: Action,
  handlers: Handlers<Action, SuccessMessage, ErrorMessage>,
): Definition<Name, Action, SuccessMessage | ErrorMessage> =>
  makeDefinition(name, actionEffect(ref, handlers));
