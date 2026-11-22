import type * as Ref from "@confect/core/Ref";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import type * as Schema from "effect/Schema";
import * as FoldkitCommand from "foldkit/command";
import * as Client from "./Client";

/**
 * Failures that a command passes to `onError`: an error declared by the ref or
 * its middleware, a `WebSocketClientError` from the client, or a `SchemaError`
 * from encoding arguments or decoding the result.
 *
 * @category Errors
 */
export type Error<Ref_ extends Ref.AnyConfect> =
  | Ref.Error<Ref_>
  | Client.WebSocketClientError
  | Schema.SchemaError;

/**
 * Callbacks that convert a function's decoded result or typed failure into an
 * application Message. Use past-tense Message names such as `SucceededSaveNote`
 * and `FailedSaveNote` to describe what happened.
 *
 * @category Configuration
 */
export interface Handlers<
  Ref_ extends Ref.AnyConfect,
  SuccessMessage,
  ErrorMessage,
> {
  /**
   * Converts the decoded return value into one of the declared Messages.
   *
   * @category Mapping
   */
  readonly onSuccess: (returns: Ref.Returns<Ref_>) => SuccessMessage;
  /**
   * Converts a declared, transport, or schema failure into a Message.
   *
   * @category Mapping
   */
  readonly onError: (error: Error<Ref_>) => ErrorMessage;
}

/**
 * The Command instance a definition call constructs.
 *
 * @category Models
 */
type Instance<
  Name extends string,
  Ref_ extends Ref.AnyConfect,
  Message,
> = Readonly<{
  /**
   * Definition name used by Foldkit to identify this Command.
   *
   * @category Models
   */
  name: Name;
  /**
   * Decoded function arguments supplied when constructing this invocation.
   *
   * @category Models
   */
  args: Ref.Args<Ref_>;
  /**
   * Deferred execution requiring Client and producing a success or failure
   * Message.
   *
   * @category Commands
   */
  effect: Effect.Effect<Message, never, Client.Client>;
}>;

type SchemaArgs<Ref_ extends Ref.AnyConfect> = Schema.Schema.Type<
  Schema.Struct<Ref.ArgsSchema<Ref_>["fields"]>
>;

/**
 * A callable Foldkit command definition that accepts the ref's decoded
 * arguments. Call it from `update` to construct a command; the request runs
 * only when Foldkit executes the command. Omit the arguments when the ref
 * declares none.
 *
 * **Details**
 *
 * The definition carries Foldkit's `CommandDefinitionTypeId` brand, so Story
 * and Scene matchers such as `Command.resolve` and `expectExact` accept it.
 *
 * @category Models
 */
export type Definition<
  Name extends string,
  Ref_ extends Ref.AnyConfect,
  Message,
> = ((...args: Ref.OptionalArgs<Ref_>) => Instance<Name, Ref_, Message>) &
  FoldkitCommand.CommandDefinitionWithArgs<
    Name,
    Ref.ArgsSchema<Ref_>["fields"],
    Effect.Effect<Message, never, Client.Client>
  >;

/**
 * Interruption policy for a command definition. Set `interrupt` to `true` to
 * target invocations by command name, or supply `keyFields` and `toKey` to
 * target invocations by selected arguments.
 *
 * **Gotchas**
 *
 * Interrupting an in-flight invocation suppresses its result Message. It does
 * not cancel a request already sent to Convex.
 *
 * @category Configuration
 */
export type InterruptOption<
  Ref_ extends Ref.AnyConfect,
  KeyField extends keyof SchemaArgs<Ref_> & string = keyof SchemaArgs<Ref_> &
    string,
> = FoldkitCommand.InterruptOption<SchemaArgs<Ref_>, KeyField>;

/**
 * Interruption policy that derives a key from selected command arguments.
 * `keyFields` determines which arguments the `Interrupt` constructor takes;
 * `toKey` maps those fields to the key.
 *
 * @category Configuration
 */
export type KeyedInterrupt<
  Ref_ extends Ref.AnyConfect,
  KeyField extends keyof SchemaArgs<Ref_> & string,
> = Exclude<InterruptOption<Ref_, KeyField>, true>;

/**
 * A Foldkit command definition whose invocations share the command name as
 * their interruption key. `Interrupt(toMessage)` targets that name and maps
 * Foldkit's `Interrupted` or `NotFound` outcome to a Message.
 *
 * @category Models
 *
 * @see {@link KeyedInterruptibleDefinition} targets invocations by argument instead.
 */
export type InterruptibleDefinition<
  Name extends string,
  Ref_ extends Ref.AnyConfect,
  Message,
> = ((...args: Ref.OptionalArgs<Ref_>) => Instance<Name, Ref_, Message> &
  Readonly<{
    /**
     * Name-based key identifying this invocation for interruption.
     *
     * @category Models
     */ key: string;
  }>) &
  FoldkitCommand.Interruptible.DefinitionWithArgsNameKeyed<
    Name,
    Ref.ArgsSchema<Ref_>["fields"],
    Effect.Effect<Message, never, Client.Client>
  >;

/**
 * A Foldkit command definition whose invocations carry a key derived from
 * selected arguments. `Interrupt(keyArgs, toMessage)` targets that key and maps
 * Foldkit's `Interrupted` or `NotFound` outcome to a Message.
 *
 * @category Models
 */
export type KeyedInterruptibleDefinition<
  Name extends string,
  Ref_ extends Ref.AnyConfect,
  KeyField extends keyof SchemaArgs<Ref_> & string,
  Message,
> = ((...args: Ref.OptionalArgs<Ref_>) => Instance<Name, Ref_, Message> &
  Readonly<{
    /**
     * Key derived from the selected arguments of this invocation.
     *
     * @category Models
     */ key: string;
  }>) &
  FoldkitCommand.Interruptible.DefinitionWithArgs<
    Name,
    Ref.ArgsSchema<Ref_>["fields"],
    Pick<SchemaArgs<Ref_>, KeyField>,
    Effect.Effect<Message, never, Client.Client>
  >;

const run = <Ref_ extends Ref.AnyConfect, SuccessMessage, ErrorMessage>(
  handlers: Handlers<Ref_, SuccessMessage, ErrorMessage>,
  invoke: (
    client: Client.Client,
  ) => Effect.Effect<Ref.Returns<Ref_>, Error<Ref_>>,
): Effect.Effect<SuccessMessage | ErrorMessage, never, Client.Client> =>
  Effect.flatMap(Client.Client, invoke).pipe(
    Effect.match({
      onSuccess: handlers.onSuccess,
      onFailure: handlers.onError,
    }),
  );

/**
 * Creates an execute function for a hand-written Foldkit query command. It
 * calls the query through `Client` and converts its decoded result or typed
 * failure into a Message.
 *
 * **When to use**
 *
 * Use when a command needs its own argument schema or composes the query with
 * other effects.
 *
 * @category Commands
 *
 * @param ref - Public Confect query ref; plain Convex refs are not accepted.
 * @param handlers - Map decoded outcomes to Messages.
 *
 * @returns A function accepting decoded ref args and returning an Effect that
 *   requires Client. No args are required for a no-args ref. Typed failures
 *   become Messages; thrown handler exceptions remain defects.
 *
 * @see {@link query} builds the complete command definition.
 */
export const queryEffect =
  <Query extends Ref.AnyConfectPublicQuery, SuccessMessage, ErrorMessage>(
    ref: Query,
    handlers: Handlers<Query, SuccessMessage, ErrorMessage>,
  ) =>
  (
    ...args: Ref.OptionalArgs<Query>
  ): Effect.Effect<SuccessMessage | ErrorMessage, never, Client.Client> =>
    run(handlers, (client) => client.query(ref, ...args));

/**
 * Creates an execute function for a hand-written Foldkit mutation command. It
 * accepts decoded arguments, calls the mutation through `Client`, and maps
 * declared, codec, and transport failures to `onError` Messages.
 *
 * **Gotchas**
 *
 * Interrupting the effect does not undo a mutation already sent to the server.
 *
 * @category Commands
 *
 * @see {@link mutation} builds the complete command definition.
 */
export const mutationEffect =
  <Mutation extends Ref.AnyConfectPublicMutation, SuccessMessage, ErrorMessage>(
    ref: Mutation,
    handlers: Handlers<Mutation, SuccessMessage, ErrorMessage>,
  ) =>
  (
    ...args: Ref.OptionalArgs<Mutation>
  ): Effect.Effect<SuccessMessage | ErrorMessage, never, Client.Client> =>
    run(handlers, (client) => client.mutation(ref, ...args));

/**
 * Creates an execute function for a hand-written Foldkit action command. It
 * accepts decoded arguments, calls the action through `Client`, and maps
 * declared, codec, and transport failures to `onError` Messages.
 *
 * **Gotchas**
 *
 * Interrupting the effect does not cancel work already running on the server.
 *
 * @category Commands
 *
 * @see {@link action} builds the complete command definition.
 */
export const actionEffect =
  <Action extends Ref.AnyConfectPublicAction, SuccessMessage, ErrorMessage>(
    ref: Action,
    handlers: Handlers<Action, SuccessMessage, ErrorMessage>,
  ) =>
  (
    ...args: Ref.OptionalArgs<Action>
  ): Effect.Effect<SuccessMessage | ErrorMessage, never, Client.Client> =>
    run(handlers, (client) => client.action(ref, ...args));

type RunWithArgs<Ref_ extends Ref.AnyConfect, Message> = (
  ...args: Ref.OptionalArgs<Ref_>
) => Effect.Effect<Message, never, Client.Client>;

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

  return Match.value(interrupt).pipe(
    Match.withReturnType<
      Definition<Name, Ref_, SuccessMessage | ErrorMessage>
    >(),
    Match.when(
      undefined,
      () =>
        FoldkitCommand.define(name, {
          args: fields,
          messages,
          execute,
        }) as Definition<Name, Ref_, SuccessMessage | ErrorMessage>,
    ),
    Match.when(
      true,
      (nameKeyedInterrupt) =>
        FoldkitCommand.define(name, {
          args: fields,
          messages,
          interrupt: nameKeyedInterrupt,
          execute,
        }) as InterruptibleDefinition<
          Name,
          Ref_,
          SuccessMessage | ErrorMessage
        >,
    ),
    Match.when(Match.defined, (keyedInterrupt) => {
      const definition: FoldkitCommand.CommandDefinitionWithArgs<
        Name,
        Fields,
        ReturnType<typeof execute>
      > = FoldkitCommand.define(name, {
        args: fields,
        messages,
        interrupt: keyedInterrupt,
        execute,
      });
      return definition as Definition<
        Name,
        Ref_,
        SuccessMessage | ErrorMessage
      >;
    }),
    Match.exhaustive,
  );
}

/**
 * Message schemas and outcome callbacks used by a command definition.
 *
 * @category Configuration
 */
type FactoryConfig<
  Ref_ extends Ref.AnyConfect,
  Messages extends ReadonlyArray<Schema.Top>,
  SuccessMessage,
  ErrorMessage,
> = Handlers<Ref_, SuccessMessage, ErrorMessage> & {
  /**
   * Schemas of the Messages that onSuccess and onError may construct.
   *
   * @category Configuration
   */
  readonly messages: Messages;
};

/**
 * Configuration for a command that can be interrupted by selected arguments.
 *
 * @category Configuration
 */
type KeyedFactoryConfig<
  Ref_ extends Ref.AnyConfect,
  Messages extends ReadonlyArray<Schema.Top>,
  SuccessMessage,
  ErrorMessage,
  KeyField extends keyof SchemaArgs<Ref_> & string,
> = FactoryConfig<Ref_, Messages, SuccessMessage, ErrorMessage> & {
  /**
   * Fields and key function used to target matching invocations.
   *
   * @category Configuration
   */
  readonly interrupt: KeyedInterrupt<Ref_, KeyField>;
};

/**
 * Configuration for a command that can be interrupted by name.
 *
 * @category Configuration
 */
type NameKeyedFactoryConfig<
  Ref_ extends Ref.AnyConfect,
  Messages extends ReadonlyArray<Schema.Top>,
  SuccessMessage,
  ErrorMessage,
> = FactoryConfig<Ref_, Messages, SuccessMessage, ErrorMessage> & {
  /**
   * Name-based interruption shared by all invocations of this command.
   *
   * @category Configuration
   */
  readonly interrupt: true;
};

/**
 * Configuration for a command without interruption.
 *
 * @category Configuration
 */
type StandardFactoryConfig<
  Ref_ extends Ref.AnyConfect,
  Messages extends ReadonlyArray<Schema.Top>,
  SuccessMessage,
  ErrorMessage,
> = FactoryConfig<Ref_, Messages, SuccessMessage, ErrorMessage> & {
  /**
   * Absent for a command without an `Interrupt` constructor.
   *
   * @category Configuration
   */
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
    return Match.value(config.interrupt).pipe(
      Match.withReturnType<
        Definition<Name, Ref_, SuccessMessage | ErrorMessage>
      >(),
      Match.when(undefined, () =>
        makeDefinition(name, ref, config.messages, runWithArgs),
      ),
      Match.when(true, (interrupt) =>
        makeDefinition(name, ref, config.messages, runWithArgs, interrupt),
      ),
      Match.when(Match.defined, (interrupt) =>
        makeDefinition(name, ref, config.messages, runWithArgs, interrupt),
      ),
      Match.exhaustive,
    );
  }

  return factory;
};

/**
 * Creates a Foldkit command definition for a public Confect query. Calling the
 * definition captures the decoded arguments; Foldkit runs the request and
 * dispatches the Message returned by `onSuccess` or `onError`.
 *
 * **Details**
 *
 * Set `interrupt` to `true` to generate an `Interrupt` constructor keyed by
 * command name, or pass `keyFields` and `toKey` to derive the key from the
 * query arguments.
 *
 * **Example** (Defining a command for a query without arguments)
 *
 * ```ts
 * import { Command } from "@confect/foldkit";
 * import refs from "confect/_generated/refs";
 * import * as Schema from "effect/Schema";
 * import { defineMessageUnion } from "foldkit/message";
 *
 * const list = refs.public.notes_and_random.notes.list;
 * const { ReceivedNotes, FailedGetNotes } = defineMessageUnion({
 *   ReceivedNotes: { notes: list.returns },
 *   FailedGetNotes: { message: Schema.String },
 * });
 * const FetchNotes = Command.query("FetchNotes", list, {
 *   messages: [ReceivedNotes, FailedGetNotes],
 *   onSuccess: (notes) => ReceivedNotes({ notes }),
 *   onError: (error) => FailedGetNotes({ message: String(error) }),
 * });
 * const command = FetchNotes();
 * ```
 *
 * @category Constructors
 *
 * @param name - Foldkit Command name, also used for name-keyed interruption.
 * @param ref - Public Confect query ref supplying the args and result codecs.
 * @param config - Declared message schemas, onSuccess/onError callbacks and an
 *   optional interrupt policy. Callbacks must return a declared Message.
 *
 * @returns A callable definition; invoking it constructs a Command requiring
 *   Client, rather than executing the request immediately.
 */
export const query: ReturnType<typeof makeFactory<Ref.AnyConfectPublicQuery>> =
  makeFactory(queryEffect);

/**
 * Creates a Foldkit command definition for a public Confect mutation. Like
 * {@link query}, the definition accepts decoded arguments and dispatches a
 * Message for the result or typed failure when Foldkit executes the command.
 *
 * **Gotchas**
 *
 * Interrupting the command suppresses its result Message but does not undo a
 * write already sent to the server.
 *
 * **Example** (Interrupting an in-flight save by command name)
 *
 * ```ts
 * import { Command } from "@confect/foldkit";
 * import refs from "confect/_generated/refs";
 * import * as Schema from "effect/Schema";
 * import { Interruptible } from "foldkit/command";
 * import { defineMessageUnion } from "foldkit/message";
 *
 * const insert = refs.public.notes_and_random.notes.insert;
 * const { SavedDraft, FailedSaveDraft, SettledCancelSave } =
 *   defineMessageUnion({
 *     SavedDraft: { noteId: insert.returns },
 *     FailedSaveDraft: { message: Schema.String },
 *     SettledCancelSave: { outcome: Interruptible.Outcome },
 *   });
 * const SaveDraft = Command.mutation("SaveDraft", insert, {
 *   messages: [SavedDraft, FailedSaveDraft],
 *   onSuccess: (noteId) => SavedDraft({ noteId }),
 *   onError: (error) => FailedSaveDraft({ message: String(error) }),
 *   interrupt: true,
 * });
 * const save = SaveDraft({ text: "First draft" });
 * const cancel = SaveDraft.Interrupt((outcome) =>
 *   SettledCancelSave({ outcome }),
 * );
 * ```
 *
 * @category Constructors
 */
export const mutation: ReturnType<
  typeof makeFactory<Ref.AnyConfectPublicMutation>
> = makeFactory(mutationEffect);

/**
 * Creates a Foldkit command definition for a public Confect action. Like
 * {@link query}, the definition takes decoded arguments and maps the result or
 * typed failure to a Message when Foldkit executes the command.
 *
 * **Gotchas**
 *
 * Interrupting the command suppresses its result Message but does not cancel
 * server-side work.
 *
 * @category Constructors
 */
export const action: ReturnType<
  typeof makeFactory<Ref.AnyConfectPublicAction>
> = makeFactory(actionEffect);
