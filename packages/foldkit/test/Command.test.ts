import { FunctionSpec, Ref } from "@confect/core";
import { describe, expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as FoldkitCommand from "foldkit/command";
import { m } from "foldkit/message";
import { beforeEach, expectTypeOf } from "vitest";
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
    args: () => Schema.Struct({ id: Schema.String }),
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

layer(StubLayer)("Command", (it) => {
  describe("definition factories", () => {
    it("carry the Command name and the CommandDefinitionTypeId brand", () => {
      const SaveNote = Command.mutation(
        "SaveNote",
        insertMutationRef,
        saveNoteHandlers,
      );

      expect(SaveNote.name).toBe("SaveNote");
      expect(FoldkitCommand.CommandDefinitionTypeId in SaveNote).toBe(true);
    });

    it("constructing a Command performs no client call", () => {
      const SaveNote = Command.mutation(
        "SaveNote",
        insertMutationRef,
        saveNoteHandlers,
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
          saveNoteHandlers,
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
          onSuccess: () => SucceededSaveNote({ note: null }),
          onError: (error) => FailedSaveNote({ error }),
        });

        const message = yield* DeleteNote({ id: "abc" }).effect;

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
          saveNoteHandlers,
        );

        const message = yield* SaveNote({ text: "hello" }).effect;

        expect(message._tag).toBe("FailedSaveNote");
        expect((message as typeof FailedSaveNote.Type).error).toBeInstanceOf(
          WebSocketClient.WebSocketClientError,
        );
      }),
    );

    it("the Command's error channel is never", () => {
      const SaveNote = Command.mutation(
        "SaveNote",
        insertMutationRef,
        saveNoteHandlers,
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
