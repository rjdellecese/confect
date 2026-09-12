import type { GenericDocument } from "convex/server";
import { getDocumentSize } from "convex/values";
import * as Array from "effect/Array";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
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

const TypeId = Symbol("@confect/server/QueryStreamReadBudget");

export interface QueryStreamReadBudget {
  readonly [TypeId]: typeof TypeId;
}

export interface Limits {
  readonly maximumRowsRead: Option.Option<number>;
  readonly maximumBytesRead: Option.Option<number>;
}

type Counts = {
  readonly rows: number;
  readonly bytes: Option.Option<{
    readonly limit: number;
    readonly read: number;
  }>;
};

type State = Data.TaggedEnum<{
  Unlimited: {};
  Active: Counts & { readonly maximumRowsRead: Option.Option<number> };
  Stopped: Counts;
}>;

const State = Data.taggedEnum<State>();

const Status = Context.Reference<Option.Option<QueryStreamReadBudget>>(
  "@confect/server/QueryStream/ReadBudgetStatus",
  { defaultValue: Option.none },
);

const exhausted = (state: State): boolean =>
  State.$match(state, {
    Unlimited: () => false,
    Stopped: () => true,
    Active: ({ rows, maximumRowsRead, bytes }) =>
      Option.exists(maximumRowsRead, (limit) => rows >= limit) ||
      Option.exists(bytes, ({ read, limit }) => read >= limit),
  });

class Budget implements QueryStreamReadBudget {
  readonly [TypeId]: typeof TypeId = TypeId;
  readonly #state: SynchronizedRef.SynchronizedRef<State>;

  constructor(state: SynchronizedRef.SynchronizedRef<State>) {
    this.#state = state;
  }

  provide() {
    return <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
      Effect.flatMap(SynchronizedRef.get(this.#state), (state) =>
        Effect.provideService(
          effect,
          Status,
          state._tag === "Unlimited" ? Option.none() : Option.some(this),
        ),
      );
  }

  isStopped() {
    return Effect.map(SynchronizedRef.get(this.#state), State.$is("Stopped"));
  }

  isExhausted() {
    return Effect.map(SynchronizedRef.get(this.#state), exhausted);
  }

  exceeded() {
    return Effect.map(
      SynchronizedRef.get(this.#state),
      (state) =>
        new ReadBudgetExceededError(
          state._tag === "Unlimited"
            ? { rowsRead: 0 }
            : {
                rowsRead: state.rows,
                ...Option.match(state.bytes, {
                  onNone: () => ({}),
                  onSome: ({ read }) => ({ bytesRead: read }),
                }),
              },
        ),
    );
  }

  charge(
    pull: Effect.Effect<Array.NonEmptyReadonlyArray<unknown>, Cause.Done>,
  ) {
    return SynchronizedRef.modifyEffect(this.#state, (state) =>
      Effect.gen(function* () {
        if (state._tag === "Unlimited") {
          return Tuple.make(Option.some(yield* pull), state);
        }
        if (state._tag === "Stopped" || exhausted(state)) {
          return Tuple.make(
            Option.none(),
            State.Stopped({ rows: state.rows, bytes: state.bytes }),
          );
        }
        const documents = yield* pull;
        return Tuple.make(
          Option.some(documents),
          State.Active({
            maximumRowsRead: state.maximumRowsRead,
            rows: state.rows + documents.length,
            bytes: Option.map(state.bytes, ({ limit, read }) => ({
              limit,
              read: Array.reduce(
                documents,
                read,
                (bytes, document) =>
                  bytes + getDocumentSize(document as GenericDocument),
              ),
            })),
          }),
        );
      }),
    ).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Cause.done(),
          onSome: Effect.succeed,
        }),
      ),
    );
  }
}

export const make = (limits: Limits): Effect.Effect<QueryStreamReadBudget> =>
  SynchronizedRef.make<State>(
    Option.isNone(limits.maximumRowsRead) &&
      Option.isNone(limits.maximumBytesRead)
      ? State.Unlimited()
      : State.Active({
          maximumRowsRead: Option.map(limits.maximumRowsRead, (limit) => limit),
          rows: 0,
          bytes: Option.map(limits.maximumBytesRead, (limit) => ({
            limit,
            read: 0,
          })),
        }),
  ).pipe(Effect.map((state) => new Budget(state)));

export const current: Effect.Effect<Option.Option<QueryStreamReadBudget>> =
  Effect.map(Status, (budget) => budget);

export const provide = (budget: QueryStreamReadBudget) =>
  (budget as Budget).provide();

export const isExhausted = (
  budget: QueryStreamReadBudget,
): Effect.Effect<boolean> => (budget as Budget).isExhausted();

export const exceeded = (
  budget: QueryStreamReadBudget,
): Effect.Effect<ReadBudgetExceededError> => (budget as Budget).exceeded();

export const isStopped = (
  status: Option.Option<QueryStreamReadBudget>,
): Effect.Effect<boolean> =>
  Option.match(status, {
    onNone: () => Effect.succeed(false),
    onSome: (budget) => (budget as Budget).isStopped(),
  });

export const charge = (encodedDocuments: Stream.Stream<unknown>) =>
  Stream.fromPull(
    Effect.gen(function* () {
      const budgetStatus = yield* Status;
      const pull = yield* Stream.toPull(encodedDocuments);
      return Option.match(budgetStatus, {
        onNone: () => pull,
        onSome: (budget) => (budget as Budget).charge(pull),
      });
    }),
  ).pipe(Stream.scoped);
