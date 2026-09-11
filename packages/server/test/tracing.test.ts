import type * as QueryStreamReadBudget from "@confect/server/QueryStreamReadBudget";
import * as QueryStreamCursor from "@confect/server/QueryStreamCursor";
import { FunctionSpec, Ref, Table } from "@confect/core";
import * as ActionRunner from "@confect/server/ActionRunner";
import type * as DataModel from "@confect/server/DataModel";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import * as DatabaseWriter from "@confect/server/DatabaseWriter";
import * as Document from "@confect/server/Document";
import * as MutationRunner from "@confect/server/MutationRunner";
import * as OrderedQuery from "@confect/server/OrderedQuery";
import * as QueryRunner from "@confect/server/QueryRunner";
import * as QueryStream from "@confect/server/QueryStream";
import { assert, describe, expect, expectTypeOf, it } from "@effect/vitest";
import type {
  GenericActionCtx,
  GenericDatabaseWriter,
  GenericDataModel,
  OrderedQuery as ConvexOrderedQuery,
} from "convex/server";
import { ConvexError, type GenericId } from "convex/values";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Tracer from "effect/Tracer";
import { vi } from "vitest";

class OperationFailure extends Schema.TaggedError<OperationFailure>()(
  "OperationFailure",
  { reason: Schema.String },
) {}

const queryRef = Ref.make(
  "operations",
  FunctionSpec.internalQuery({
    name: "query",
    args: () => ({ value: Schema.FiniteFromString }),
    returns: () => Schema.FiniteFromString,
    error: () => OperationFailure,
  }),
);
const mutationRef = Ref.make(
  "operations",
  FunctionSpec.internalMutation({
    name: "mutation",
    args: () => ({ value: Schema.FiniteFromString }),
    returns: () => Schema.FiniteFromString,
    error: () => OperationFailure,
  }),
);
const actionRef = Ref.make(
  "operations",
  FunctionSpec.internalAction({
    name: "action",
    args: () => ({ value: Schema.FiniteFromString }),
    returns: () => Schema.FiniteFromString,
    error: () => OperationFailure,
  }),
);

const makeRecorder = Effect.gen(function* () {
  const baseTracer = yield* Effect.service(Tracer.Tracer);
  const spans: Array<Tracer.Span> = [];
  const tracer = Tracer.make({
    span(options) {
      const span = baseTracer.span(options);
      spans.push(span);
      return span;
    },
  });
  return { spans, tracer };
});

const notes = Table.make(() =>
  Schema.Struct({ value: Schema.FiniteFromString }),
)("notes");
const databaseSchema = DatabaseSchema.make({ notes });
type ConvexDataModel = DataModel.ToConvex<
  DataModel.FromSchema<typeof databaseSchema>
>;
const noteId = "note-id" as GenericId<"notes">;

describe("server operation tracing", () => {
  it.effect(
    "traces lazy, repeatable query stream consumers without per-element spans",
    () =>
      Effect.gen(function* () {
        const recorder = yield* makeRecorder;
        let reads = 0;
        const source = new QueryStream.QueryStream(
          "asc",
          ["_id"],
          Stream.suspend(() => {
            reads++;
            return Stream.make(
              new QueryStream.Element({ doc: Option.some(7), key: ["note"] }),
            );
          }),
        ).pipe(QueryStream.map((value) => value + 1));
        const unique = QueryStream.unique(source);
        const paginate = QueryStream.paginate(source, {
          numItems: 2,
          cursor: null,
        });
        const curried = source.pipe(
          QueryStream.paginate({ numItems: 2, cursor: null }),
        );

        expectTypeOf(unique).toEqualTypeOf<
          Effect.Effect<Option.Option<number>, QueryStream.NotUniqueError>
        >();
        expectTypeOf(paginate).toEqualTypeOf<
          Effect.Effect<
            QueryStream.PaginationResult<number>,
            QueryStreamReadBudget.ExceededError
          >
        >();
        expectTypeOf(curried).toEqualTypeOf<typeof paginate>();
        expect(reads).toBe(0);
        expect(recorder.spans).toEqual([]);

        const results = yield* Effect.all([
          unique,
          paginate,
          curried,
          unique,
          paginate,
          curried,
        ]).pipe(Effect.withSpan("caller"), Effect.withTracer(recorder.tracer));

        const page = {
          page: [8],
          isDone: true,
          continueCursor: QueryStreamCursor.END_CURSOR,
        };
        expect(results).toEqual([
          Option.some(8),
          page,
          page,
          Option.some(8),
          page,
          page,
        ]);
        expect(reads).toBe(6);
        expect(recorder.spans.map((span) => span.name)).toEqual([
          "caller",
          "QueryStream.unique",
          "QueryStream.paginate",
          "QueryStream.paginate",
          "QueryStream.unique",
          "QueryStream.paginate",
          "QueryStream.paginate",
        ]);
        const [parent, ...children] = recorder.spans;
        for (const child of children) {
          expect(Option.getOrThrow(child.parent)).toBe(parent);
          assert(child.status._tag === "Ended");
          expect(Exit.isSuccess(child.status.exit)).toBe(true);
        }
        expect(children[0]).not.toBe(children[3]);
      }),
  );

  it.effect(
    "ends the unique span with its original typed cardinality error",
    () =>
      Effect.gen(function* () {
        const recorder = yield* makeRecorder;
        const source = new QueryStream.QueryStream(
          "asc",
          ["_id"],
          Stream.make(
            new QueryStream.Element({ doc: Option.some(1), key: [1] }),
            new QueryStream.Element({ doc: Option.some(2), key: [2] }),
          ),
        );
        const error = yield* QueryStream.unique(source).pipe(
          Effect.flip,
          Effect.withTracer(recorder.tracer),
        );

        assert.instanceOf(error, QueryStream.NotUniqueError);
        expect(recorder.spans).toHaveLength(1);
        const span = recorder.spans[0]!;
        expect(span.name).toBe("QueryStream.unique");
        assert(span.status._tag === "Ended");
        assert(Exit.isFailure(span.status.exit));
        expect(
          Option.getOrThrow(Cause.findErrorOption(span.status.exit.cause)),
        ).toBe(error);
        expect(Cause.pretty(span.status.exit.cause)).toContain(
          "QueryStream.unique",
        );
      }),
  );

  it.effect("preserves typed stream failures inside the pagination span", () =>
    Effect.gen(function* () {
      const recorder = yield* makeRecorder;
      const failure = new OperationFailure({ reason: "query failed" });
      const source = new QueryStream.QueryStream(
        "asc",
        ["_id"],
        Stream.fail(failure),
      );
      const error = yield* QueryStream.paginate(source, {
        numItems: 1,
        cursor: null,
      }).pipe(Effect.flip, Effect.withTracer(recorder.tracer));

      expect(error).toBe(failure);
      expect(recorder.spans).toHaveLength(1);
      const span = recorder.spans[0]!;
      expect(span.name).toBe("QueryStream.paginate");
      assert(span.status._tag === "Ended");
      assert(Exit.isFailure(span.status.exit));
      expect(
        Option.getOrThrow(Cause.findErrorOption(span.status.exit.cause)),
      ).toBe(failure);
      expect(Cause.pretty(span.status.exit.cause)).toContain(
        "QueryStream.paginate",
      );
    }),
  );

  it.effect(
    "traces lazy, repeatable RPC calls without a codec child span",
    () =>
      Effect.gen(function* () {
        const recorder = yield* makeRecorder;
        const invoke = vi
          .fn<(ref: unknown, args: unknown) => Promise<unknown>>()
          .mockResolvedValue("7");

        yield* Effect.gen(function* () {
          const runQuery = yield* QueryRunner.QueryRunner;
          const runMutation = yield* MutationRunner.MutationRunner;
          const runAction = yield* ActionRunner.ActionRunner;
          const query = runQuery(queryRef, { value: 2 });
          const mutation = runMutation(mutationRef, { value: 3 });
          const action = runAction(actionRef, { value: 4 });

          expectTypeOf(query).toEqualTypeOf<
            Effect.Effect<number, OperationFailure | Schema.SchemaError>
          >();
          expectTypeOf(mutation).toEqualTypeOf<typeof query>();
          expectTypeOf(action).toEqualTypeOf<typeof query>();
          expect(invoke).not.toHaveBeenCalled();
          expect(recorder.spans).toEqual([]);

          const result = yield* Effect.all([
            query,
            mutation,
            action,
            query,
          ]).pipe(
            Effect.withSpan("caller"),
            Effect.withTracer(recorder.tracer),
          );
          expect(result).toEqual([7, 7, 7, 7]);
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              QueryRunner.layer(
                invoke as GenericActionCtx<GenericDataModel>["runQuery"],
              ),
              MutationRunner.layer(
                invoke as GenericActionCtx<GenericDataModel>["runMutation"],
              ),
              ActionRunner.layer(
                invoke as GenericActionCtx<GenericDataModel>["runAction"],
              ),
            ),
          ),
        );

        expect(invoke.mock.calls.map(([, args]) => args)).toEqual([
          { value: "2" },
          { value: "3" },
          { value: "4" },
          { value: "2" },
        ]);
        expect(recorder.spans.map((span) => span.name)).toEqual([
          "caller",
          "QueryRunner.run",
          "MutationRunner.run",
          "ActionRunner.run",
          "QueryRunner.run",
        ]);
        for (const span of recorder.spans.slice(1)) {
          expect(Option.getOrThrow(span.parent)).toBe(recorder.spans[0]);
          assert(span.status._tag === "Ended");
          assert.isTrue(Exit.isSuccess(span.status.exit));
        }
      }),
  );

  it.effect(
    "records RPC failure before caller recovery and preserves typed errors",
    () =>
      Effect.gen(function* () {
        const recorder = yield* makeRecorder;
        const invoke = vi
          .fn<(ref: unknown, args: unknown) => Promise<unknown>>()
          .mockRejectedValue(
            new ConvexError({ _tag: "OperationFailure", reason: "rejected" }),
          );
        const error = yield* Effect.gen(function* () {
          const runQuery = yield* QueryRunner.QueryRunner;
          return yield* Effect.flip(runQuery(queryRef, { value: 2 }));
        }).pipe(
          Effect.provide(
            QueryRunner.layer(
              invoke as GenericActionCtx<GenericDataModel>["runQuery"],
            ),
          ),
          Effect.withTracer(recorder.tracer),
        );

        assert.instanceOf(error, OperationFailure);
        expect(error.reason).toBe("rejected");
        expect(recorder.spans).toHaveLength(1);
        const span = recorder.spans[0]!;
        expect(span.name).toBe("QueryRunner.run");
        assert(span.status._tag === "Ended");
        assert.isTrue(Exit.isFailure(span.status.exit));
      }),
  );

  it.effect(
    "traces complete database writes and keeps encoding and reads lazy",
    () =>
      Effect.gen(function* () {
        const recorder = yield* makeRecorder;
        const insert = vi
          .fn<GenericDatabaseWriter<ConvexDataModel>["insert"]>()
          .mockResolvedValue(noteId);
        const replace = vi
          .fn<GenericDatabaseWriter<ConvexDataModel>["replace"]>()
          .mockResolvedValue(undefined);
        const get = vi
          .fn<GenericDatabaseWriter<ConvexDataModel>["get"]>()
          .mockResolvedValue({ _id: noteId, _creationTime: 1, value: "1" });
        const writer = DatabaseWriter.make(databaseSchema, {
          insert,
          replace,
          get,
        } as unknown as GenericDatabaseWriter<ConvexDataModel>).table("notes");
        const insertEffect = writer.insert({ value: 2 });
        const patchEffect = writer.patch(noteId, { value: 3 });
        const replaceEffect = writer.replace(noteId, { value: 4 });

        expect(insert).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
        expect(get).not.toHaveBeenCalled();
        expect(recorder.spans).toEqual([]);

        yield* Effect.all([
          insertEffect,
          patchEffect,
          replaceEffect,
          insertEffect,
        ]).pipe(Effect.withTracer(recorder.tracer));

        expect(insert.mock.calls).toEqual([
          ["notes", { value: "2" }],
          ["notes", { value: "2" }],
        ]);
        expect(get).toHaveBeenCalledExactlyOnceWith(noteId);
        expect(replace.mock.calls).toEqual([
          [noteId, { value: "3" }],
          [noteId, { value: "4" }],
        ]);
        expect(recorder.spans.map((span) => span.name)).toEqual([
          "DatabaseWriter.insert",
          "DatabaseWriter.patch",
          "DatabaseWriter.replace",
          "DatabaseWriter.insert",
        ]);
      }),
  );

  it.effect("keeps document encoding failures inside the write span", () =>
    Effect.gen(function* () {
      const recorder = yield* makeRecorder;
      const replace =
        vi.fn<GenericDatabaseWriter<ConvexDataModel>["replace"]>();
      const get = vi
        .fn<GenericDatabaseWriter<ConvexDataModel>["get"]>()
        .mockResolvedValue({ _id: noteId, _creationTime: 1, value: "1" });
      const writer = DatabaseWriter.make(databaseSchema, {
        replace,
        get,
      } as unknown as GenericDatabaseWriter<ConvexDataModel>).table("notes");
      const error = yield* writer
        .patch(noteId, { value: "invalid" as never })
        .pipe(Effect.flip, Effect.withTracer(recorder.tracer));

      assert.instanceOf(error, Document.DocumentEncodeError);
      expect(replace).not.toHaveBeenCalled();
      expect(recorder.spans).toHaveLength(1);
      const span = recorder.spans[0]!;
      expect(span.name).toBe("DatabaseWriter.patch");
      assert(span.status._tag === "Ended");
      assert.isTrue(Exit.isFailure(span.status.exit));
    }),
  );

  it.effect(
    "traces pagination through decoding and preserves lazy filter execution",
    () =>
      Effect.gen(function* () {
        const recorder = yield* makeRecorder;
        const paginate = vi
          .fn<ConvexOrderedQuery<ConvexDataModel["notes"]>["paginate"]>()
          .mockResolvedValue({
            page: [{ _id: noteId, _creationTime: 1, value: "7" }],
            isDone: true,
            continueCursor: "done",
          });
        const filter = vi.fn();
        const query = { paginate, filter } as unknown as ConvexOrderedQuery<
          ConvexDataModel["notes"]
        >;
        filter.mockReturnValue(query);
        const operation = OrderedQuery.make(query, "notes", notes.Fields);
        const predicate: Parameters<typeof operation.paginate>[1] = (q) =>
          q.eq(q.field("value"), "7");
        const options = { numItems: 1, cursor: null };
        const page = operation.paginate(options, predicate);

        expect(filter).not.toHaveBeenCalled();
        expect(paginate).not.toHaveBeenCalled();
        const results = yield* Effect.all([page, page]).pipe(
          Effect.withTracer(recorder.tracer),
        );
        expect(results[0]?.page).toEqual([
          { _id: noteId, _creationTime: 1, value: 7 },
        ]);
        expect(results[1]).toEqual(results[0]);
        expect(filter.mock.calls).toEqual([[predicate], [predicate]]);
        expect(paginate.mock.calls).toEqual([[options], [options]]);
        expect(recorder.spans.map((span) => span.name)).toEqual([
          "OrderedQuery.paginate",
          "OrderedQuery.paginate",
        ]);
      }),
  );
});
