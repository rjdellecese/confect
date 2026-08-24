import { FunctionSpec, Ref } from "@confect/core";
import { describe, expect, layer } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as FoldkitCommand from "foldkit/command";
import { m } from "foldkit/message";
import { beforeEach, expectTypeOf, test } from "vitest";
import * as Command from "@confect/foldkit/Command";
import * as WebSocketClient from "@confect/foldkit/WebSocketClient";

interface Call {
  readonly method: "query" | "mutation" | "action";
  readonly name: string;
  readonly args: unknown;
}

let calls: Array<Call> = [];
let nextResult: Effect.Effect<unknown, unknown> = Effect.succeed({});

beforeEach(() => {
  calls = [];
  nextResult = Effect.succeed({});
});

const record =
  (method: Call["method"]) =>
  (ref: Ref.Any, ...rest: [unknown?]) =>
    Effect.suspend(() => {
      calls.push({
        method,
        name: Ref.getConvexFunctionName(ref),
        args: rest[0] ?? {},
      });
      return nextResult;
    });

const StubLayer = Layer.sync(
  WebSocketClient.WebSocketClient,
  () =>
    ({
      url: "https://test.convex.cloud",
      setAuth: () => Effect.void,
      query: record("query"),
      mutation: record("mutation"),
      action: record("action"),
      reactiveQuery: () => Stream.empty,
    }) as any,
);

const listQueryRef = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "list",
    args: () => Schema.Struct({}),
    returns: () => Schema.Struct({}),
  }),
);

const insertMutationRef = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "insert",
    args: () => Schema.Struct({ text: Schema.String }),
    returns: () => Schema.Struct({}),
  }),
);

const sendActionRef = Ref.make(
  "email",
  FunctionSpec.publicAction({
    name: "send",
    args: () => Schema.Struct({ to: Schema.String }),
    returns: () => Schema.Struct({}),
  }),
);

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  id: Schema.String,
}) {}

const deleteMutationRef = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "deleteOrFail",
    args: () => Schema.Struct({ id: Schema.String, scope: Schema.String }),
    returns: () => Schema.Null,
    error: () => NotFound,
  }),
);

const SucceededSaveNote = m("SucceededSaveNote", { note: Schema.Unknown });
const FailedSaveNote = m("FailedSaveNote", { error: Schema.Unknown });
type Message = typeof SucceededSaveNote.Type | typeof FailedSaveNote.Type;

const saveNoteHandlers = {
  onSuccess: (note: unknown) => SucceededSaveNote({ note }),
  onError: (error: unknown) => FailedSaveNote({ error }),
};

const saveNoteConfig = {
  messages: [SucceededSaveNote, FailedSaveNote],
  ...saveNoteHandlers,
};

layer(StubLayer)("Command", (it) => {
  describe("definition factories", () => {
    it("carry the Command name and the CommandDefinitionTypeId brand", () => {
      const SaveNote = Command.mutation(
        "SaveNote",
        insertMutationRef,
        saveNoteConfig,
      );

      expect(SaveNote.name).toBe("SaveNote");
      expect(FoldkitCommand.CommandDefinitionTypeId in SaveNote).toBe(true);
    });

    it("constructing a Command performs no client call", () => {
      const SaveNote = Command.mutation(
        "SaveNote",
        insertMutationRef,
        saveNoteConfig,
      );

      const command = SaveNote({ text: "hello" });

      expect(command.name).toBe("SaveNote");
      expect(calls).toEqual([]);
    });

    it.effect("mutation success produces the onSuccess Message", () =>
      Effect.gen(function* () {
        const SaveNote = Command.mutation(
          "SaveNote",
          insertMutationRef,
          saveNoteConfig,
        );

        const message = yield* SaveNote({ text: "hello" }).effect;

        expect(message).toEqual(SucceededSaveNote({ note: {} }));
        expect(calls).toEqual([
          { method: "mutation", name: "notes:insert", args: { text: "hello" } },
        ]);
      }),
    );

    it.effect("no-args query is callable without args", () =>
      Effect.gen(function* () {
        const FetchNotes = Command.query("FetchNotes", listQueryRef, {
          messages: [SucceededSaveNote, FailedSaveNote],
          onSuccess: (notes) => SucceededSaveNote({ note: notes }),
          onError: (error) => FailedSaveNote({ error }),
        });

        const message = yield* FetchNotes().effect;

        expect(message._tag).toBe("SucceededSaveNote");
        expect(calls).toEqual([
          { method: "query", name: "notes:list", args: {} },
        ]);
      }),
    );

    it.effect("action success produces the onSuccess Message", () =>
      Effect.gen(function* () {
        const SendEmail = Command.action("SendEmail", sendActionRef, {
          messages: [SucceededSaveNote, FailedSaveNote],
          onSuccess: () => SucceededSaveNote({ note: null }),
          onError: (error) => FailedSaveNote({ error }),
        });

        const message = yield* SendEmail({ to: "user@example.com" }).effect;

        expect(message._tag).toBe("SucceededSaveNote");
        expect(calls).toEqual([
          {
            method: "action",
            name: "email:send",
            args: { to: "user@example.com" },
          },
        ]);
      }),
    );

    it.effect("typed error is folded into the onError Message", () =>
      Effect.gen(function* () {
        nextResult = Effect.fail(new NotFound({ id: "abc" }));

        const DeleteNote = Command.mutation("DeleteNote", deleteMutationRef, {
          messages: [SucceededSaveNote, FailedSaveNote],
          onSuccess: () => SucceededSaveNote({ note: null }),
          onError: (error) => FailedSaveNote({ error }),
        });

        const message = yield* DeleteNote({ id: "abc", scope: "notes" }).effect;

        expect(message._tag).toBe("FailedSaveNote");
        expect((message as typeof FailedSaveNote.Type).error).toBeInstanceOf(
          NotFound,
        );
      }),
    );

    it.effect("transport error is folded into the onError Message", () =>
      Effect.gen(function* () {
        nextResult = Effect.fail(
          new WebSocketClient.WebSocketClientError({ cause: "network down" }),
        );

        const SaveNote = Command.mutation(
          "SaveNote",
          insertMutationRef,
          saveNoteConfig,
        );

        const message = yield* SaveNote({ text: "hello" }).effect;

        expect(message._tag).toBe("FailedSaveNote");
        expect((message as typeof FailedSaveNote.Type).error).toBeInstanceOf(
          WebSocketClient.WebSocketClientError,
        );
      }),
    );

    it("requires messages to be declared", () => {
      // @ts-expect-error — messages is required
      Command.mutation("SaveNote", insertMutationRef, saveNoteHandlers);
    });

    it("rejects an explicitly undefined interrupt option", () => {
      // @ts-expect-error — absence and `interrupt: undefined` are distinct
      Command.mutation("SaveNote", insertMutationRef, {
        ...saveNoteConfig,
        interrupt: undefined,
      });
    });

    it("rejects a handler Message not declared in messages", () => {
      Command.mutation("SaveNote", insertMutationRef, {
        messages: [FailedSaveNote],
        // @ts-expect-error — onSuccess must produce a declared Message
        onSuccess: (note: unknown) => SucceededSaveNote({ note }),
        onError: (error: unknown) => FailedSaveNote({ error }),
      });
    });

    it("the Command's error channel is never", () => {
      const SaveNote = Command.mutation(
        "SaveNote",
        insertMutationRef,
        saveNoteConfig,
      );

      expectTypeOf(SaveNote({ text: "hello" }).effect).toEqualTypeOf<
        Effect.Effect<Message, never, WebSocketClient.WebSocketClient>
      >();

      // @ts-expect-error — a mutation with args is not callable without them
      SaveNote();
    });
  });

  describe("effect helpers", () => {
    it.effect("mutationEffect folds success and failure into Messages", () =>
      Effect.gen(function* () {
        const saveNote = Command.mutationEffect(
          insertMutationRef,
          saveNoteHandlers,
        );

        const success = yield* saveNote({ text: "hello" });
        expect(success).toEqual(SucceededSaveNote({ note: {} }));

        nextResult = Effect.fail(
          new WebSocketClient.WebSocketClientError({ cause: "network down" }),
        );
        const failure = yield* saveNote({ text: "hello" });
        expect(failure._tag).toBe("FailedSaveNote");
      }),
    );

    it("supports interrupt: true, keyed by the Command name", () => {
      const SaveDraft = Command.mutation("SaveDraft", insertMutationRef, {
        messages: [SucceededSaveNote, FailedSaveNote],
        onSuccess: (note) => SucceededSaveNote({ note }),
        onError: (error) => FailedSaveNote({ error }),
        interrupt: true,
      });

      const command = SaveDraft({ text: "hello" });
      expect(command.key).toBe("SaveDraft");

      const interrupt = SaveDraft.Interrupt((outcome) => outcome);
      expect(interrupt.name).toBe("SaveDraft.Interrupt");
      expect(interrupt.interruptsKey).toBe("SaveDraft");
    });

    it("supports interrupt keyed by the ref's args", () => {
      const DeleteNote = Command.mutation("DeleteNote", deleteMutationRef, {
        messages: [SucceededSaveNote, FailedSaveNote],
        onSuccess: () => SucceededSaveNote({ note: null }),
        onError: (error) => FailedSaveNote({ error }),
        interrupt: {
          keyFields: ["id"],
          toKey: ({ id }) => id,
        },
      });

      const command = DeleteNote({ id: "abc", scope: "notes" });
      expect(command.key).toBe("DeleteNote:abc");

      const interrupt = DeleteNote.Interrupt(
        { id: "abc" },
        (outcome) => outcome,
      );
      expect(interrupt.name).toBe("DeleteNote.Interrupt");
      expect(interrupt.interruptsKey).toBe("DeleteNote:abc");

      Command.mutation("DeleteNote", deleteMutationRef, {
        messages: [SucceededSaveNote, FailedSaveNote],
        onSuccess: () => SucceededSaveNote({ note: null }),
        onError: (error) => FailedSaveNote({ error }),
        // @ts-expect-error — keyFields must name fields of the ref's args
        interrupt: { keyFields: ["nope"], toKey: () => "" },
      });
    });

    it.effect("Interrupt stops an in-flight invocation", () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        nextResult = Deferred.succeed(started, undefined).pipe(
          Effect.andThen(() => Effect.never),
        );

        const SaveDraft = Command.mutation("SaveDraft", insertMutationRef, {
          messages: [SucceededSaveNote, FailedSaveNote],
          onSuccess: (note) => SucceededSaveNote({ note }),
          onError: (error) => FailedSaveNote({ error }),
          interrupt: true,
        });

        const fiber = yield* Effect.forkChild(
          SaveDraft({ text: "hello" }).effect,
        );
        yield* Deferred.await(started);

        const outcome = yield* SaveDraft.Interrupt((o) => o).effect;
        expect(outcome._tag).toBe("Interrupted");
        yield* Fiber.await(fiber);

        const secondOutcome = yield* SaveDraft.Interrupt((o) => o).effect;
        expect(secondOutcome._tag).toBe("NotFound");
      }),
    );

    it("an interruptible Command's error channel is still never", () => {
      const SaveDraft = Command.mutation("SaveDraft", insertMutationRef, {
        messages: [SucceededSaveNote, FailedSaveNote],
        onSuccess: (note) => SucceededSaveNote({ note }),
        onError: (error) => FailedSaveNote({ error }),
        interrupt: true,
      });

      expectTypeOf(SaveDraft({ text: "hello" }).effect).toEqualTypeOf<
        Effect.Effect<Message, never, WebSocketClient.WebSocketClient>
      >();
    });

    it("composes inside a hand-written interruptible Command.define", () => {
      const saveNote = Command.mutationEffect(insertMutationRef, {
        onSuccess: (note) => SucceededSaveNote({ note }),
        onError: (error) => FailedSaveNote({ error }),
      });

      const SaveDraft = FoldkitCommand.define("SaveDraft", {
        args: { text: Schema.String },
        messages: [SucceededSaveNote, FailedSaveNote],
        interrupt: true,
        execute: (args) => saveNote(args),
      });

      expect(SaveDraft.name).toBe("SaveDraft");
      expect(typeof SaveDraft.Interrupt).toBe("function");
    });
  });
});

// Mirrors foldkit/test's internal `ResolvableCommandDefinition` — the
// constraint Story/Scene `Command.resolve` and `expectExact` place on the
// definitions they accept. Factory-built definitions must stay assignable to
// it, or user test suites can't match Confect-built Commands.
type ResolvableCommandDefinition<Name extends string, ResultMessage> =
  | FoldkitCommand.CommandDefinition<Name, ResultMessage>
  | FoldkitCommand.Interruptible.DefinitionNoArgs<
      Name,
      Effect.Effect<ResultMessage, any, any>
    >
  | FoldkitCommand.Interruptible.DefinitionWithArgs<
      Name,
      any,
      any,
      Effect.Effect<ResultMessage, any, any>
    >
  | FoldkitCommand.Interruptible.DefinitionWithArgsNameKeyed<
      Name,
      any,
      Effect.Effect<ResultMessage, any, any>
    >;

describe("Foldkit test-tooling compatibility", () => {
  const asResolvable = <Name extends string, ResultMessage>(
    definition: ResolvableCommandDefinition<Name, ResultMessage>,
  ): ResolvableCommandDefinition<Name, ResultMessage> => definition;

  test("factory definitions satisfy the Story/Scene resolve constraint", () => {
    const SaveNote = Command.mutation(
      "SaveNote",
      insertMutationRef,
      saveNoteConfig,
    );
    const SaveDraft = Command.mutation("SaveDraft", insertMutationRef, {
      ...saveNoteConfig,
      interrupt: true,
    });
    const DeleteNote = Command.mutation("DeleteNote", deleteMutationRef, {
      messages: [SucceededSaveNote, FailedSaveNote],
      onSuccess: () => SucceededSaveNote({ note: null }),
      onError: (error) => FailedSaveNote({ error }),
      interrupt: { keyFields: ["id"], toKey: ({ id }) => id },
    });
    const FetchNotes = Command.query("FetchNotes", listQueryRef, {
      messages: [SucceededSaveNote, FailedSaveNote],
      onSuccess: (notes) => SucceededSaveNote({ note: notes }),
      onError: (error) => FailedSaveNote({ error }),
    });

    expect(asResolvable(SaveNote)).toBe(SaveNote);
    expect(asResolvable(SaveDraft)).toBe(SaveDraft);
    expect(asResolvable(DeleteNote)).toBe(DeleteNote);
    expect(asResolvable(FetchNotes)).toBe(FetchNotes);
  });

  test("the resolve constraint infers the definition's Message type", () => {
    const SaveNote = Command.mutation(
      "SaveNote",
      insertMutationRef,
      saveNoteConfig,
    );

    const resolve = <Name extends string, ResultMessage>(
      _definition: ResolvableCommandDefinition<Name, ResultMessage>,
      resultMessage: ResultMessage,
    ): ResultMessage => resultMessage;

    const resolved = resolve(SaveNote, SucceededSaveNote({ note: null }));
    expectTypeOf(resolved).toEqualTypeOf<Message>();

    // @ts-expect-error — a Message outside the definition's union is rejected
    resolve(SaveNote, { _tag: "Unrelated" as const });
  });
});
