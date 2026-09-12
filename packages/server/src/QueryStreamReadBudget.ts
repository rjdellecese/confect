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
    return "QueryStream.paginate: the read budget was exhausted before a safe page boundary; increase the budget or simplify the query";
  }
}

export type Phase = Data.TaggedEnum<{
  Active: {};
  Stopped: {};
}>;

export const Phase = Data.taggedEnum<Phase>();

export class State extends Data.Class<{
  readonly rows: number;
  readonly bytes: number;
  readonly status: Phase;
}> {}

export interface Limits {
  readonly maximumRowsRead: Option.Option<number>;
  readonly maximumBytesRead: Option.Option<number>;
}

export const Limits = Context.Reference<Limits>(
  "@confect/server/QueryStream/ReadBudgetLimits",
  {
    defaultValue: () => ({
      maximumRowsRead: Option.none(),
      maximumBytesRead: Option.none(),
    }),
  },
);

export type Status = Option.Option<SynchronizedRef.SynchronizedRef<State>>;

export const Status = Context.Reference<Status>(
  "@confect/server/QueryStream/ReadBudgetStatus",
  { defaultValue: Option.none },
);

export const isExhausted = (limits: Limits, state: State): boolean =>
  Option.exists(limits.maximumRowsRead, (limit) => state.rows >= limit) ||
  Option.exists(limits.maximumBytesRead, (limit) => state.bytes >= limit);

export const isStopped = (status: Status): Effect.Effect<boolean> =>
  Option.match(status, {
    onNone: () => Effect.succeed(false),
    onSome: (stateRef) =>
      Effect.map(SynchronizedRef.get(stateRef), (state) =>
        Phase.$is("Stopped")(state.status),
      ),
  });

export const charge = (encodedDocuments: Stream.Stream<unknown>) =>
  Stream.fromPull(
    Effect.gen(function* () {
      const budgetStatus = yield* Status;
      const limits = yield* Limits;
      const pull = yield* Stream.toPull(encodedDocuments);
      return Option.match(budgetStatus, {
        onNone: () => pull,
        onSome: (stateRef) =>
          SynchronizedRef.modifyEffect(stateRef, (state) =>
            Effect.gen(function* () {
              if (isExhausted(limits, state)) {
                return Tuple.make(
                  Option.none(),
                  new State({
                    rows: state.rows,
                    bytes: state.bytes,
                    status: Phase.Stopped(),
                  }),
                );
              }
              const documents = yield* pull;
              return Tuple.make(
                Option.some(documents),
                new State({
                  status: state.status,
                  rows: state.rows + documents.length,
                  bytes: Option.match(limits.maximumBytesRead, {
                    onNone: () => state.bytes,
                    onSome: () =>
                      Array.reduce(
                        documents,
                        state.bytes,
                        (bytes, document) =>
                          bytes + getDocumentSize(document as GenericDocument),
                      ),
                  }),
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
          ),
      });
    }),
  ).pipe(Stream.scoped);
