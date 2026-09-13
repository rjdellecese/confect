import type { GenericDocument } from "convex/server";
import { getDocumentSize } from "convex/values";
import * as Array from "effect/Array";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SynchronizedRef from "effect/SynchronizedRef";
import * as Tuple from "effect/Tuple";

/**
 * A page exhausted its read budget without a safe logical continuation.
 *
 * @experimental
 */
export class ReadBudgetExceededError extends Schema.TaggedError<ReadBudgetExceededError>()(
  "ReadBudgetExceededError",
  { rowsRead: Schema.Natural, bytesRead: Schema.optionalKey(Schema.Natural) },
) {
  override get message() {
    return "The read budget was exhausted before a safe page boundary; increase the budget or simplify the query";
  }
}

const TypeId = "~@confect/server/QueryStreamReadBudget";

export interface QueryStreamReadBudget {
  readonly [TypeId]: typeof TypeId;
  readonly state: SynchronizedRef.SynchronizedRef<State>;
}

/**
 * Input at the pagination boundary; limits are parsed before allocation.
 */
export interface Limits {
  readonly maximumRowsRead: Option.Option<number>;
  readonly maximumBytesRead: Option.Option<number>;
}

const ReadLimit = Schema.Natural.pipe(Schema.brand("QueryStream/ReadLimit"));
type ReadLimit = typeof ReadLimit.Type;

export class InvalidReadLimitError extends Data.TaggedError(
  "InvalidReadLimitError",
)<{
  readonly field: keyof Limits;
  readonly value: number;
}> {
  override get message(): string {
    return `QueryStream.paginate: ${this.field} must be a nonnegative integer (received ${this.value})`;
  }
}

interface ByteCount {
  readonly limit: ReadLimit;
  readonly read: number;
}

// Each active or stopped budget owns at least one limit, and byte counts exist
// exactly when byte accounting is enabled.
type Accounting = Data.TaggedEnum<{
  Rows: { readonly rows: number; readonly maximumRowsRead: ReadLimit };
  Bytes: { readonly rows: number; readonly bytes: ByteCount };
  RowsAndBytes: {
    readonly rows: number;
    readonly maximumRowsRead: ReadLimit;
    readonly bytes: ByteCount;
  };
}>;
const Accounting = Data.taggedEnum<Accounting>();

type State = Data.TaggedEnum<{
  Unlimited: {};
  Active: { readonly accounting: Accounting };
  Stopped: { readonly accounting: Accounting };
}>;
const State = Data.taggedEnum<State>();

const initial = (
  limits: Limits,
): Result.Result<State, InvalidReadLimitError> => {
  const parse = (field: keyof Limits) =>
    Option.match(limits[field], {
      onNone: () => Result.succeed(Option.none<ReadLimit>()),
      onSome: (value) =>
        Schema.decodeResult(ReadLimit)(value).pipe(
          Result.map(Option.some),
          Result.mapError(() => new InvalidReadLimitError({ field, value })),
        ),
    });
  return Result.gen(function* () {
    const rows = yield* parse("maximumRowsRead");
    const bytes = yield* parse("maximumBytesRead");
    return Option.match(rows, {
      onNone: () =>
        Option.match(bytes, {
          onNone: State.Unlimited,
          onSome: (limit) =>
            State.Active({
              accounting: Accounting.Bytes({
                rows: 0,
                bytes: { limit, read: 0 },
              }),
            }),
        }),
      onSome: (maximumRowsRead) =>
        State.Active({
          accounting: Option.match(bytes, {
            onNone: () => Accounting.Rows({ rows: 0, maximumRowsRead }),
            onSome: (limit) =>
              Accounting.RowsAndBytes({
                rows: 0,
                maximumRowsRead,
                bytes: { limit, read: 0 },
              }),
          }),
        }),
    });
  });
};

const exhausted = (state: State): boolean =>
  State.$match(state, {
    Unlimited: () => false,
    Stopped: () => true,
    Active: ({ accounting }) =>
      Accounting.$match(accounting, {
        Rows: ({ rows, maximumRowsRead }) => rows >= maximumRowsRead,
        Bytes: ({ bytes }) => bytes.read >= bytes.limit,
        RowsAndBytes: ({ rows, maximumRowsRead, bytes }) =>
          rows >= maximumRowsRead || bytes.read >= bytes.limit,
      }),
  });

/**
 * Pure accounting; document sizing and pulling belong to the shell.
 */
const record = (
  accounting: Accounting,
  rows: number,
  bytes: number,
): Accounting =>
  Accounting.$match(accounting, {
    Rows: (current) =>
      Accounting.Rows({ ...current, rows: current.rows + rows }),
    Bytes: (current) =>
      Accounting.Bytes({
        rows: current.rows + rows,
        bytes: { limit: current.bytes.limit, read: current.bytes.read + bytes },
      }),
    RowsAndBytes: (current) =>
      Accounting.RowsAndBytes({
        maximumRowsRead: current.maximumRowsRead,
        rows: current.rows + rows,
        bytes: { limit: current.bytes.limit, read: current.bytes.read + bytes },
      }),
  });

const errorCounts = Accounting.$match({
  Rows: ({ rows }) => ({ rowsRead: rows }),
  Bytes: ({ rows, bytes }) => ({ rowsRead: rows, bytesRead: bytes.read }),
  RowsAndBytes: ({ rows, bytes }) => ({
    rowsRead: rows,
    bytesRead: bytes.read,
  }),
});

const toError = (state: State): ReadBudgetExceededError =>
  new ReadBudgetExceededError(
    State.$match(state, {
      Unlimited: () => ({ rowsRead: 0 }),
      Active: ({ accounting }) => errorCounts(accounting),
      Stopped: ({ accounting }) => errorCounts(accounting),
    }),
  );

const Status = Context.Reference<Option.Option<QueryStreamReadBudget>>(
  "@confect/server/QueryStream/ReadBudgetStatus",
  { defaultValue: Option.none },
);

// Budget allocation is internal to the existing QueryStream.paginate span.
export const make = Effect.fnUntraced(function* (limits: Limits) {
  const state = yield* Effect.fromResult(initial(limits));
  return {
    [TypeId]: TypeId,
    state: yield* SynchronizedRef.make(state),
  } satisfies QueryStreamReadBudget;
});

export const current: Effect.Effect<Option.Option<QueryStreamReadBudget>> =
  Status;

export const provide =
  (budget: QueryStreamReadBudget) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.flatMap(SynchronizedRef.get(budget.state), (state) =>
      Effect.provideService(
        effect,
        Status,
        State.$match(state, {
          Unlimited: () => Option.none(),
          Active: () => Option.some(budget),
          Stopped: () => Option.some(budget),
        }),
      ),
    );

export const isExhausted = (
  budget: QueryStreamReadBudget,
): Effect.Effect<boolean> =>
  Effect.map(SynchronizedRef.get(budget.state), exhausted);

export const exceeded = (
  budget: QueryStreamReadBudget,
): Effect.Effect<ReadBudgetExceededError> =>
  Effect.map(SynchronizedRef.get(budget.state), toError);

export const isStopped = (
  status: Option.Option<QueryStreamReadBudget>,
): Effect.Effect<boolean> =>
  Option.match(status, {
    onNone: () => Effect.succeed(false),
    onSome: (budget) =>
      Effect.map(SynchronizedRef.get(budget.state), State.$is("Stopped")),
  });

const chargePull = (
  budget: QueryStreamReadBudget,
  pull: Effect.Effect<Array.NonEmptyReadonlyArray<unknown>, Cause.Done>,
) =>
  SynchronizedRef.modifyEffect(budget.state, (state) =>
    State.$match(state, {
      Unlimited: () =>
        Effect.map(pull, (documents) =>
          Tuple.make(Option.some(documents), state),
        ),
      Stopped: () =>
        Effect.succeed(
          Tuple.make(
            Option.none<Array.NonEmptyReadonlyArray<unknown>>(),
            state,
          ),
        ),
      Active: (active) =>
        Effect.gen(function* () {
          if (exhausted(active))
            return Tuple.make(
              Option.none<Array.NonEmptyReadonlyArray<unknown>>(),
              State.Stopped({ accounting: active.accounting }),
            );
          // Hold the lock across the actual pull: concurrent leaves share one budget.
          const documents = yield* pull;
          const measureBytes = () =>
            Array.reduce(
              documents,
              0,
              (total, document) =>
                total + getDocumentSize(document as GenericDocument),
            );
          const bytes = Accounting.$match(active.accounting, {
            Rows: () => 0,
            Bytes: measureBytes,
            RowsAndBytes: measureBytes,
          });
          return Tuple.make(
            Option.some(documents),
            State.Active({
              accounting: record(active.accounting, documents.length, bytes),
            }),
          );
        }),
    }),
  ).pipe(
    Effect.flatMap(
      Option.match({ onNone: () => Cause.done(), onSome: Effect.succeed }),
    ),
  );

export const charge = (encodedDocuments: Stream.Stream<unknown>) =>
  Stream.fromPull(
    Effect.gen(function* () {
      const budget = yield* Status;
      const pull = yield* Stream.toPull(encodedDocuments);
      return Option.match(budget, {
        onNone: () => pull,
        onSome: (value) => chargePull(value, pull),
      });
    }),
  ).pipe(Stream.scoped);
