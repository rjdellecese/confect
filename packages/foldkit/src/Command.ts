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

type SchemaArgs<Ref_ extends Ref.AnyConfect> = Schema.Schema.Type<
  Schema.Struct<Ref.ArgsSchema<Ref_>["fields"]>
>;

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
  KeyField extends keyof SchemaArgs<Ref_> & string = keyof SchemaArgs<Ref_> &
    string,
> = FoldkitCommand.InterruptOption<SchemaArgs<Ref_>, KeyField>;

/**
 * The keyed arm of `InterruptOption`: `keyFields` declares the args the
 * `Interrupt` constructor requires; `toKey` derives the key part from them.
 */
export type KeyedInterrupt<
  Ref_ extends Ref.AnyConfect,
  KeyField extends keyof SchemaArgs<Ref_> & string,
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
  KeyField extends keyof SchemaArgs<Ref_> & string,
  Message,
> = ((
  ...args: Ref.OptionalArgs<Ref_>
) => Instance<Name, Ref_, Message> & Readonly<{ key: string }>) &
  FoldkitCommand.Interruptible.DefinitionWithArgs<
    Name,
    Ref.ArgsSchema<Ref_>["fields"],
    Pick<SchemaArgs<Ref_>, KeyField>,
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

type RunWithArgs<Ref_ extends Ref.AnyConfect, Message> = (
  ...args: Ref.OptionalArgs<Ref_>
) => Effect.Effect<Message, never, WebSocketClient.WebSocketClient>;

function makeDefinition<
  Name extends string,
  Ref_ extends Ref.AnyConfect,
  SuccessMessage,
  ErrorMessage,
  KeyField extends keyof SchemaArgs<Ref_> & string = keyof SchemaArgs<Ref_> &
    string,
>(
  name: Name,
  ref: Ref_,
  messages: ReadonlyArray<Schema.Top>,
  runWithArgs: RunWithArgs<Ref_, SuccessMessage | ErrorMessage>,
  interrupt?: InterruptOption<Ref_, KeyField>,
): Definition<Name, Ref_, SuccessMessage | ErrorMessage> {
  type Fields = Ref.ArgsSchema<Ref_>["fields"];
  type FoldkitArgs = SchemaArgs<Ref_>;

  const fields: Fields = ref.args.fields;
  const execute = (args: FoldkitArgs | undefined) =>
    runWithArgs(
      ...((args === undefined ? [] : [args]) as Ref.OptionalArgs<Ref_>),
    );

  // Delegating to Foldkit's `define` keeps the `CommandDefinitionTypeId`
  // brand, the `Effect.suspend` around `execute`, the `messageMappers` chain
  // that Story/Scene test resolution replays, and — with `interrupt` — the
  // registry wiring behind the `Interrupt` constructor. `args` is the ref's
  // own args schema fields and `messages` is the caller's declaration; a
  // keyed interrupt's `toKey` receives the invocation's actual args.
  // Confect makes the args optional when a ref's fields are empty; Foldkit
  // sees the supplied `args` object and consequently declares them required.
  if (interrupt === undefined) {
    return FoldkitCommand.define(name, {
      args: fields,
      messages,
      execute,
    }) as Definition<Name, Ref_, SuccessMessage | ErrorMessage>;
  }
  if (interrupt === true) {
    return FoldkitCommand.define(name, {
      args: fields,
      messages,
      interrupt,
      execute,
    }) as InterruptibleDefinition<Name, Ref_, SuccessMessage | ErrorMessage>;
  }
  const definition: FoldkitCommand.CommandDefinitionWithArgs<
    Name,
    Fields,
    ReturnType<typeof execute>
  > = FoldkitCommand.define(name, {
    args: fields,
    messages,
    interrupt,
    execute,
  });
  return definition as Definition<Name, Ref_, SuccessMessage | ErrorMessage>;
}

type FactoryConfig<
  Ref_ extends Ref.AnyConfect,
  Messages extends ReadonlyArray<Schema.Top>,
  SuccessMessage,
  ErrorMessage,
> = Handlers<Ref_, SuccessMessage, ErrorMessage> & {
  readonly messages: Messages;
};

type KeyedFactoryConfig<
  Ref_ extends Ref.AnyConfect,
  Messages extends ReadonlyArray<Schema.Top>,
  SuccessMessage,
  ErrorMessage,
  KeyField extends keyof SchemaArgs<Ref_> & string,
> = FactoryConfig<Ref_, Messages, SuccessMessage, ErrorMessage> & {
  readonly interrupt: KeyedInterrupt<Ref_, KeyField>;
};

type NameKeyedFactoryConfig<
  Ref_ extends Ref.AnyConfect,
  Messages extends ReadonlyArray<Schema.Top>,
  SuccessMessage,
  ErrorMessage,
> = FactoryConfig<Ref_, Messages, SuccessMessage, ErrorMessage> & {
  readonly interrupt: true;
};

type StandardFactoryConfig<
  Ref_ extends Ref.AnyConfect,
  Messages extends ReadonlyArray<Schema.Top>,
  SuccessMessage,
  ErrorMessage,
> = FactoryConfig<Ref_, Messages, SuccessMessage, ErrorMessage> & {
  readonly interrupt?: never;
};

/**
 * Builds the overload set for one ref kind. Each arm preserves whether
 * `interrupt` is absent, `true`, or args-keyed all the way to
 * `makeDefinition`.
 */
const makeFactory = <BoundRef extends Ref.AnyConfect>(
  effectHelper: <Ref_ extends BoundRef, SuccessMessage, ErrorMessage>(
    ref: Ref_,
    handlers: Handlers<Ref_, SuccessMessage, ErrorMessage>,
  ) => RunWithArgs<Ref_, SuccessMessage | ErrorMessage>,
) => {
  function factory<
    const Name extends string,
    Ref_ extends BoundRef,
    const Messages extends ReadonlyArray<Schema.Top>,
    SuccessMessage extends Schema.Schema.Type<Messages[number]>,
    ErrorMessage extends Schema.Schema.Type<Messages[number]>,
    KeyField extends keyof SchemaArgs<Ref_> & string,
  >(
    name: Name,
    ref: Ref_,
    config: KeyedFactoryConfig<
      Ref_,
      Messages,
      SuccessMessage,
      ErrorMessage,
      KeyField
    >,
  ): KeyedInterruptibleDefinition<
    Name,
    Ref_,
    KeyField,
    SuccessMessage | ErrorMessage
  >;
  function factory<
    const Name extends string,
    Ref_ extends BoundRef,
    const Messages extends ReadonlyArray<Schema.Top>,
    SuccessMessage extends Schema.Schema.Type<Messages[number]>,
    ErrorMessage extends Schema.Schema.Type<Messages[number]>,
  >(
    name: Name,
    ref: Ref_,
    config: NameKeyedFactoryConfig<
      Ref_,
      Messages,
      SuccessMessage,
      ErrorMessage
    >,
  ): InterruptibleDefinition<Name, Ref_, SuccessMessage | ErrorMessage>;
  function factory<
    const Name extends string,
    Ref_ extends BoundRef,
    const Messages extends ReadonlyArray<Schema.Top>,
    SuccessMessage extends Schema.Schema.Type<Messages[number]>,
    ErrorMessage extends Schema.Schema.Type<Messages[number]>,
  >(
    name: Name,
    ref: Ref_,
    config: StandardFactoryConfig<Ref_, Messages, SuccessMessage, ErrorMessage>,
  ): Definition<Name, Ref_, SuccessMessage | ErrorMessage>;
  function factory<
    const Name extends string,
    Ref_ extends BoundRef,
    SuccessMessage,
    ErrorMessage,
    KeyField extends keyof SchemaArgs<Ref_> & string,
  >(
    name: Name,
    ref: Ref_,
    config: FactoryConfig<
      Ref_,
      ReadonlyArray<Schema.Top>,
      SuccessMessage,
      ErrorMessage
    > & {
      readonly interrupt?: InterruptOption<Ref_, KeyField>;
    },
  ): Definition<Name, Ref_, SuccessMessage | ErrorMessage> {
    const runWithArgs = effectHelper(ref, config);
    if (config.interrupt === undefined) {
      return makeDefinition(name, ref, config.messages, runWithArgs);
    }
    if (config.interrupt === true) {
      return makeDefinition(
        name,
        ref,
        config.messages,
        runWithArgs,
        config.interrupt,
      );
    }
    return makeDefinition(
      name,
      ref,
      config.messages,
      runWithArgs,
      config.interrupt,
    );
  }

  return factory;
};

/**
 * A Foldkit Command definition for a Confect query whose Command args are the
 * ref's args:
 *
 * ```ts
 * const FetchNote = Command.query("FetchNote", refs.public.notes.get, {
 *   messages: [GotNote, FailedGetNote],
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
 *   messages: [SucceededSaveDraft, FailedSaveDraft],
 *   onSuccess: (noteId) => SucceededSaveDraft({ noteId }),
 *   onError: (error) => FailedSaveDraft({ message: String(error) }),
 *   interrupt: true,
 * })
 * // In update:
 * // [model, [SaveDraft.Interrupt((outcome) => CompletedCancelSaveDraft({ outcome }))]]
 * ```
 */
export const query = makeFactory<Ref.AnyConfectPublicQuery>(queryEffect);

/**
 * A Foldkit Command definition for a Confect mutation whose Command args are
 * the ref's args. See `query`.
 */
export const mutation =
  makeFactory<Ref.AnyConfectPublicMutation>(mutationEffect);

/**
 * A Foldkit Command definition for a Confect action whose Command args are
 * the ref's args. See `query`.
 */
export const action = makeFactory<Ref.AnyConfectPublicAction>(actionEffect);
