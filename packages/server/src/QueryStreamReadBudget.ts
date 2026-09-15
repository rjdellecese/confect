import type { GenericDocument } from "convex/server";
import { getDocumentSize } from "convex/values";
import * as Array from "effect/Array";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Pull from "effect/Pull";
import * as Stream from "effect/Stream";
import * as SynchronizedRef from "effect/SynchronizedRef";
import * as Tuple from "effect/Tuple";

/**
 * @experimental
 */
export interface QueryStreamReadBudget {
  readonly isUnlimited: Effect.Effect<boolean>;
  readonly isStopped: Effect.Effect<boolean>;
  readonly isExhausted: Effect.Effect<boolean>;
  readonly getReadCounts: Effect.Effect<ReadCounts>;
  /**
   * Returns a stream that records reads against this budget and stops
   * requesting further batches once exhausted. Apply directly to the document
   * source before buffering, filtering, or combining its output.
   */
  readonly accountFor: (
    encodedDocuments: Stream.Stream<unknown>,
  ) => Stream.Stream<unknown>;
}

/**
 * @experimental
 */
export interface Limits {
  readonly maximumRowsRead: Option.Option<number>;
  readonly maximumBytesRead: Option.Option<number>;
}

export interface ReadCounts {
  readonly rowsRead: number;
  readonly bytesRead: number;
}

type State = Data.TaggedEnum<{
  Active: ReadCounts;
  Stopped: ReadCounts;
}>;

const State = Data.taggedEnum<State>();

export const QueryStreamReadBudget = Context.Service<QueryStreamReadBudget>(
  "@confect/server/QueryStreamReadBudget",
);

const isExhausted = (state: State, limits: Limits): boolean =>
  State.$match(state, {
    Stopped: () => true,
    Active: ({ rowsRead, bytesRead }) =>
      Option.exists(limits.maximumRowsRead, (limit) => rowsRead >= limit) ||
      Option.exists(limits.maximumBytesRead, (limit) => bytesRead >= limit),
  });

const readCounts = ({ rowsRead, bytesRead }: ReadCounts): ReadCounts => ({
  rowsRead,
  bytesRead,
});

const record = (
  counts: ReadCounts,
  documents: Array.NonEmptyReadonlyArray<unknown>,
): ReadCounts => ({
  rowsRead: counts.rowsRead + documents.length,
  bytesRead: Array.reduce(
    documents,
    counts.bytesRead,
    (bytes, document) => bytes + getDocumentSize(document as GenericDocument),
  ),
});

/**
 * @experimental
 */
export const make = Effect.fnUntraced(function* (
  limits: Limits,
): Effect.fn.Return<QueryStreamReadBudget> {
  const unlimited =
    Option.isNone(limits.maximumRowsRead) &&
    Option.isNone(limits.maximumBytesRead);
  const stateRef = yield* SynchronizedRef.make<State>(
    State.Active({ rowsRead: 0, bytesRead: 0 }),
  );
  const accountForPull: (
    pull: Pull.Pull<Array.NonEmptyReadonlyArray<unknown>>,
  ) => Pull.Pull<Array.NonEmptyReadonlyArray<unknown>> = unlimited
    ? (pull) =>
        Effect.uninterruptibleMask((restore) =>
          Effect.tap(restore(pull), (documents) =>
            SynchronizedRef.update(stateRef, (state) =>
              State.Active(record(state, documents)),
            ),
          ),
        )
    : (pull) =>
        SynchronizedRef.modifyEffect(stateRef, (state) =>
          Effect.gen(function* () {
            if (isExhausted(state, limits)) {
              return Tuple.make(
                Option.none(),
                State.Stopped(readCounts(state)),
              );
            }
            const documents = yield* pull;
            return Tuple.make(
              Option.some(documents),
              State.Active(record(state, documents)),
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
  return QueryStreamReadBudget.of({
    isUnlimited: Effect.succeed(unlimited),
    isStopped: Effect.map(SynchronizedRef.get(stateRef), State.$is("Stopped")),
    isExhausted: Effect.map(SynchronizedRef.get(stateRef), (state) =>
      isExhausted(state, limits),
    ),
    getReadCounts: Effect.map(SynchronizedRef.get(stateRef), readCounts),
    accountFor: (encodedDocuments) =>
      Stream.transformPull(encodedDocuments, (pull) =>
        Effect.succeed(accountForPull(pull)),
      ).pipe(Stream.scoped),
  });
});
