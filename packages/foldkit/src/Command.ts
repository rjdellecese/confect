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

/**
 * Keys each invocation by a part derived from the ref's args, so concurrent
 * invocations can be interrupted independently. `keyFields` declares the args
 * the `Interrupt` constructor requires; `toKey` derives the key part from
 * them.
 */
export interface KeyedInterrupt<
  Ref_ extends Ref.Any,
  KeyField extends keyof Ref.Args<Ref_> & string,
> {
  readonly keyFields: readonly [KeyField, ...ReadonlyArray<KeyField>];
  readonly toKey: (keyArgs: Pick<Ref.Args<Ref_>, KeyField>) => string;
}

/**
 * Makes a factory-built Command interruptible. `true` keys every invocation
 * by the Command name — right when at most one invocation is meaningfully in
 * flight. A `KeyedInterrupt` derives the key part from the ref's args, so
 * concurrent invocations can be targeted independently.
 *
 * Interrupting stops the client-side Effect and guarantees the invocation's
 * result Messages never dispatch — it does not cancel the Convex function on
 * the server, which runs to completion once the call is on the wire.
 */
export type InterruptOption<
  Ref_ extends Ref.Any,
  KeyField extends keyof Ref.Args<Ref_> & string = keyof Ref.Args<Ref_> &
    string,
> = true | KeyedInterrupt<Ref_, KeyField>;

/**
 * An interruptible Command definition whose key is the Command name. Its
 * `Interrupt` constructor builds an ordinary Command that stops every
 * in-flight invocation and results in `toMessage(outcome)`.
 */
export interface InterruptibleDefinition<
  Name extends string,
  Ref_ extends Ref.Any,
  Message,
> {
  readonly [FoldkitCommand.CommandDefinitionTypeId]: FoldkitCommand.CommandDefinitionTypeId;
  readonly name: Name;
  readonly Interrupt: FoldkitCommand.Interruptible.InterruptDefinitionNoArgs<Name>;
  (
    ...args: Ref.OptionalArgs<Ref_>
  ): FoldkitCommand.Command<Message, never, WebSocketClient.WebSocketClient>;
}

/**
 * An interruptible Command definition whose key is derived from the ref's
 * args. Its `Interrupt` constructor takes the declared key args and builds an
 * ordinary Command that stops every in-flight invocation under that key.
 */
export interface KeyedInterruptibleDefinition<
  Name extends string,
  Ref_ extends Ref.Any,
  KeyField extends keyof Ref.Args<Ref_> & string,
  Message,
> {
  readonly [FoldkitCommand.CommandDefinitionTypeId]: FoldkitCommand.CommandDefinitionTypeId;
  readonly name: Name;
  readonly Interrupt: FoldkitCommand.Interruptible.InterruptDefinitionWithArgs<
    Name,
    Pick<Ref.Args<Ref_>, KeyField>
  >;
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
  interrupt: InterruptOption<Ref_> | undefined,
): Definition<Name, Ref_, SuccessMessage | ErrorMessage> =>
  // Delegating to Foldkit's `define` keeps the `CommandDefinitionTypeId`
  // brand, the `Effect.suspend` around `execute`, the `messageMappers` chain
  // that Story/Scene test resolution replays, and — with `interrupt` — the
  // registry wiring behind the `Interrupt` constructor. `messages` is
  // typing-only, `args` is only checked for presence, and a keyed
  // interrupt's `toKey` receives the invocation's actual args, so the casts
  // don't change runtime behavior — they substitute the ref-derived call
  // signature for the schema-derived one `define` would declare.
  FoldkitCommand.define(name, {
    args: {},
    messages: [],
    interrupt,
    execute: (args: Ref.Args<Ref_> | undefined) =>
      runWithArgs(
        ...((args === undefined ? [] : [args]) as Ref.OptionalArgs<Ref_>),
      ),
  } as never) as never;

/**
 * The overload set of a Command definition factory bound to `Bound`: a keyed
 * interrupt yields a `KeyedInterruptibleDefinition`, `interrupt: true` an
 * `InterruptibleDefinition`, and no `interrupt` a plain `Definition`.
 */
interface Factory<Bound extends Ref.Any> {
  <
    const Name extends string,
    Ref_ extends Bound,
    SuccessMessage,
    ErrorMessage,
    KeyField extends keyof Ref.Args<Ref_> & string,
  >(
    name: Name,
    ref: Ref_,
    config: Handlers<Ref_, SuccessMessage, ErrorMessage> & {
      readonly interrupt: KeyedInterrupt<Ref_, KeyField>;
    },
  ): KeyedInterruptibleDefinition<
    Name,
    Ref_,
    KeyField,
    SuccessMessage | ErrorMessage
  >;
  <const Name extends string, Ref_ extends Bound, SuccessMessage, ErrorMessage>(
    name: Name,
    ref: Ref_,
    config: Handlers<Ref_, SuccessMessage, ErrorMessage> & {
      readonly interrupt: true;
    },
  ): InterruptibleDefinition<Name, Ref_, SuccessMessage | ErrorMessage>;
  <const Name extends string, Ref_ extends Bound, SuccessMessage, ErrorMessage>(
    name: Name,
    ref: Ref_,
    config: Handlers<Ref_, SuccessMessage, ErrorMessage> & {
      readonly interrupt?: never;
    },
  ): Definition<Name, Ref_, SuccessMessage | ErrorMessage>;
}

const makeFactory = <Bound extends Ref.Any>(
  effectHelper: (
    ref: Bound,
    handlers: Handlers<Bound, unknown, unknown>,
  ) => (
    ...args: Ref.OptionalArgs<Bound>
  ) => Effect.Effect<unknown, never, WebSocketClient.WebSocketClient>,
): Factory<Bound> =>
  ((
    name: string,
    ref: Bound,
    config: Handlers<Bound, unknown, unknown> & {
      readonly interrupt?: InterruptOption<Bound>;
    },
  ) =>
    makeDefinition(
      name,
      effectHelper(ref, config),
      config.interrupt,
    )) as Factory<Bound>;

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
 *
 * Pass `interrupt` to make invocations interruptible via the returned
 * definition's `Interrupt` constructor — `true` keys them by the Command
 * name, `{ keyFields, toKey }` by a part derived from the ref's args:
 *
 * ```ts
 * const SaveDraft = Command.mutation("SaveDraft", refs.public.notes.insert, {
 *   onSuccess: (noteId) => SucceededSaveDraft({ noteId }),
 *   onError: (error) => FailedSaveDraft({ message: String(error) }),
 *   interrupt: true,
 * })
 * // In update:
 * // [model, [SaveDraft.Interrupt((outcome) => CompletedCancelSaveDraft({ outcome }))]]
 * ```
 */
export const query: Factory<Ref.AnyPublicQuery> = makeFactory(queryEffect);

/**
 * A Foldkit Command definition for a Confect mutation whose Command args are
 * the ref's args. See `query`.
 */
export const mutation: Factory<Ref.AnyPublicMutation> =
  makeFactory(mutationEffect);

/**
 * A Foldkit Command definition for a Confect action whose Command args are
 * the ref's args. See `query`.
 */
export const action: Factory<Ref.AnyPublicAction> = makeFactory(actionEffect);
