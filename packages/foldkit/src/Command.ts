import type * as Ref from "@confect/core/Ref";
import * as Effect from "effect/Effect";
import type * as Schema from "effect/Schema";
import * as FoldkitCommand from "foldkit/command";
import * as WebSocketClient from "./WebSocketClient";

/**
 * Everything a Command against `Ref_` can fail with before it is folded into
 * an `onError` Message: the ref's typed error (if it declares an `error`
 * schema), a transport-level `WebSocketClientError`, or a `SchemaError` from
 * encoding args or decoding returns.
 */
export type Error<Ref_ extends Ref.AnyConfect> =
  | Ref.Error<Ref_>
  | WebSocketClient.WebSocketClientError
  | Schema.SchemaError;

/**
 * Maps a Confect function's outcome into the app's Messages. Every failure —
 * the ref's typed error, a transport error, or a codec error — arrives via
 * `onError`, so the resulting Command's error channel is `never`, as Foldkit
 * requires. Follow Foldkit's naming convention: past-tense facts like
 * `SucceededSaveNote` / `FailedSaveNote`.
 */
export interface Handlers<
  Ref_ extends Ref.AnyConfect,
  SuccessMessage,
  ErrorMessage,
> {
  readonly onSuccess: (returns: Ref.Returns<Ref_>) => SuccessMessage;
  readonly onError: (error: Error<Ref_>) => ErrorMessage;
}

/**
 * The Command instance a definition call constructs.
 */
type Instance<
  Name extends string,
  Ref_ extends Ref.AnyConfect,
  Message,
> = Readonly<{
  name: Name;
  args: Ref.Args<Ref_>;
  effect: Effect.Effect<Message, never, WebSocketClient.WebSocketClient>;
}>;

/**
 * A Foldkit Command definition whose args are the ref's args: our
 * ref-derived call signature (args optional when the ref declares none)
 * intersected with Foldkit's own `CommandDefinitionWithArgs`, which supplies
 * the `CommandDefinitionTypeId` brand and makes the definition assignable
 * wherever Foldkit accepts one — including Story/Scene `Command.resolve`
 * and `expectExact` matchers. Call it from `update` to construct a Command
 * instance; nothing runs until the Foldkit runtime executes it.
 */
export type Definition<
  Name extends string,
  Ref_ extends Ref.AnyConfect,
  Message,
> = ((...args: Ref.OptionalArgs<Ref_>) => Instance<Name, Ref_, Message>) &
  FoldkitCommand.CommandDefinitionWithArgs<
    Name,
    Ref.ArgsSchema<Ref_>["fields"],
    Effect.Effect<Message, never, WebSocketClient.WebSocketClient>
  >;

/**
 * Makes a factory-built Command interruptible — Foldkit's `InterruptOption`
 * applied to the ref's args. `true` keys every invocation by the Command
 * name — right when at most one invocation is meaningfully in flight; a
 * `KeyedInterrupt` derives the key part from the ref's args, so concurrent
 * invocations can be targeted independently.
 *
 * Interrupting stops the client-side Effect and guarantees the invocation's
 * result Messages never dispatch — it does not cancel the Convex function on
 * the server, which runs to completion once the call is on the wire.
 */
export type InterruptOption<
  Ref_ extends Ref.AnyConfect,
  KeyField extends keyof Ref.Args<Ref_> & string = keyof Ref.Args<Ref_> &
    string,
> = FoldkitCommand.InterruptOption<Ref.Args<Ref_>, KeyField>;

/**
 * The keyed arm of `InterruptOption`: `keyFields` declares the args the
 * `Interrupt` constructor requires; `toKey` derives the key part from them.
 */
export type KeyedInterrupt<
  Ref_ extends Ref.AnyConfect,
  KeyField extends keyof Ref.Args<Ref_> & string,
> = Exclude<InterruptOption<Ref_, KeyField>, true>;

/**
 * An interruptible Command definition whose key is the Command name — the
 * ref-derived call signature intersected with Foldkit's
 * `Interruptible.DefinitionWithArgsNameKeyed`, which supplies the brand and
 * the `Interrupt` constructor.
 */
export type InterruptibleDefinition<
  Name extends string,
  Ref_ extends Ref.AnyConfect,
  Message,
> = ((
  ...args: Ref.OptionalArgs<Ref_>
) => Instance<Name, Ref_, Message> & Readonly<{ key: string }>) &
  FoldkitCommand.Interruptible.DefinitionWithArgsNameKeyed<
    Name,
    Ref.ArgsSchema<Ref_>["fields"],
    Effect.Effect<Message, never, WebSocketClient.WebSocketClient>
  >;

/**
 * An interruptible Command definition whose key is derived from the ref's
 * args — the ref-derived call signature intersected with Foldkit's
 * `Interruptible.DefinitionWithArgs`, which supplies the brand and the
 * key-args-taking `Interrupt` constructor.
 */
export type KeyedInterruptibleDefinition<
  Name extends string,
  Ref_ extends Ref.AnyConfect,
  KeyField extends keyof Ref.Args<Ref_> & string,
  Message,
> = ((
  ...args: Ref.OptionalArgs<Ref_>
) => Instance<Name, Ref_, Message> & Readonly<{ key: string }>) &
  FoldkitCommand.Interruptible.DefinitionWithArgs<
    Name,
    Ref.ArgsSchema<Ref_>["fields"],
    Pick<Ref.Args<Ref_>, KeyField>,
    Effect.Effect<Message, never, WebSocketClient.WebSocketClient>
  >;

const run = <Ref_ extends Ref.AnyConfect, SuccessMessage, ErrorMessage>(
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
  <Query extends Ref.AnyConfectPublicQuery, SuccessMessage, ErrorMessage>(
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
  <Mutation extends Ref.AnyConfectPublicMutation, SuccessMessage, ErrorMessage>(
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
  <Action extends Ref.AnyConfectPublicAction, SuccessMessage, ErrorMessage>(
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
  Ref_ extends Ref.AnyConfect,
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
interface Factory<Bound extends Ref.AnyConfect> {
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

const makeFactory = <Bound extends Ref.AnyConfect>(
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
export const query: Factory<Ref.AnyConfectPublicQuery> =
  makeFactory(queryEffect);

/**
 * A Foldkit Command definition for a Confect mutation whose Command args are
 * the ref's args. See `query`.
 */
export const mutation: Factory<Ref.AnyConfectPublicMutation> =
  makeFactory(mutationEffect);

/**
 * A Foldkit Command definition for a Confect action whose Command args are
 * the ref's args. See `query`.
 */
export const action: Factory<Ref.AnyConfectPublicAction> =
  makeFactory(actionEffect);
