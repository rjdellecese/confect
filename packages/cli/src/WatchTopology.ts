import * as Data from "effect/Data";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";
import type { Kind } from "./EntryPoint";
import * as SyncState from "./SyncState";

type State = Data.TaggedEnum<{
  Reconciling: { readonly revision: number };
  Observing: {
    readonly revision: number;
    readonly initial: Deferred.Deferred<void>;
  };
}>;
const State = Data.taggedEnum<State>();

type Decision = Data.TaggedEnum<{
  Take: { readonly pending: SyncState.Pending };
  Wait: { readonly ready: Effect.Effect<void> };
}>;
const Decision = Data.taggedEnum<Decision>();

export const make = Effect.fn("WatchTopology.make")(function* (
  pending: Ref.Ref<SyncState.Pending>,
) {
  const state = yield* Ref.make<State>(State.Reconciling({ revision: 0 }));
  const changed = yield* Ref.make(yield* Deferred.make<void>());
  const lock = yield* Semaphore.make(1);
  const notify = Effect.gen(function* () {
    const previous = yield* Ref.getAndSet(
      changed,
      yield* Deferred.make<void>(),
    );
    yield* Deferred.succeed(previous, undefined);
  });

  const invalidate = Effect.fn("WatchTopology.invalidate")(
    function* (update: (pending: SyncState.Pending) => SyncState.Pending) {
      yield* Ref.update(state, ({ revision }) =>
        State.Reconciling({ revision: revision + 1 }),
      );
      yield* Ref.update(pending, update);
      yield* notify;
    },
    (effect) => lock.withPermit(effect),
  );

  return {
    revision: Ref.get(state).pipe(Effect.map((current) => current.revision)),
    invalidate: invalidate(SyncState.full),
    invalidateEntry: (entry: Kind) =>
      invalidate((current) => SyncState.add(current, [entry])),
    reconcile: Effect.fn("WatchTopology.reconcile")(
      function* (revision: number, initial: Deferred.Deferred<void>) {
        const current = yield* Ref.get(state);
        if (current.revision !== revision) return;
        yield* Ref.set(state, State.Observing({ revision, initial }));
        yield* notify;
      },
      (effect) => lock.withPermit(effect),
    ),
    takePending: lock
      .withPermit(
        Effect.gen(function* () {
          const current = yield* Ref.get(state);
          const notification = yield* Ref.get(changed);
          return yield* State.$match(current, {
            Reconciling: () =>
              Effect.succeed(
                Decision.Wait({ ready: Deferred.await(notification) }),
              ),
            Observing: ({ initial }) =>
              Effect.gen(function* () {
                if (yield* Deferred.isDone(initial))
                  return Decision.Take({
                    pending: yield* Ref.getAndSet(pending, SyncState.empty),
                  });
                return Decision.Wait({
                  ready: Effect.raceFirst(
                    Deferred.await(notification),
                    Deferred.await(initial),
                  ),
                });
              }),
          });
        }),
      )
      .pipe(
        Effect.flatMap(
          Decision.$match({
            Take: ({ pending: taken }) => Effect.succeedSome(taken),
            Wait: ({ ready }) =>
              ready.pipe(Effect.as(Option.none<SyncState.Pending>())),
          }),
        ),
        Effect.repeat({ until: Option.isSome<SyncState.Pending> }),
        Effect.map((result) => result.value),
      ),
  };
});

export type WatchTopology = Effect.Success<ReturnType<typeof make>>;
