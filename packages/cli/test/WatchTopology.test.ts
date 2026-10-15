import { expect, it } from "@effect/vitest";
import * as WatchTopology from "@confect/cli/WatchTopology";
import * as SyncState from "@confect/cli/SyncState";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";

it.effect("waits for initial observation before consuming pending work", () =>
  Effect.gen(function* () {
    const pending = yield* Ref.make(SyncState.full(SyncState.empty));
    const topology = yield* WatchTopology.make(pending);
    const initial = yield* Deferred.make<void>();
    const taken = yield* Deferred.make<void>();
    const consumer = yield* topology.takePending.pipe(
      Effect.tap(() => Deferred.succeed(taken, undefined)),
      Effect.forkScoped,
    );
    yield* Effect.yieldNow;
    expect(yield* Deferred.isDone(taken)).toBe(false);
    yield* topology.reconcile(0, initial);
    yield* Effect.yieldNow;
    expect(yield* Deferred.isDone(taken)).toBe(false);
    yield* Deferred.succeed(initial, undefined);
    expect((yield* Fiber.join(consumer)).work._tag).toBe("Full");
    expect(yield* Ref.get(pending)).toEqual(SyncState.empty);
  }).pipe(Effect.scoped),
);

it.effect(
  "rechecks topology invalidated while initial observation settles",
  () =>
    Effect.gen(function* () {
      const pending = yield* Ref.make(SyncState.full(SyncState.empty));
      const topology = yield* WatchTopology.make(pending);
      const oldInitial = yield* Deferred.make<void>();
      const initial = yield* Deferred.make<void>();
      const taken = yield* Deferred.make<void>();
      yield* topology.reconcile(0, oldInitial);
      const consumer = yield* topology.takePending.pipe(
        Effect.tap(() => Deferred.succeed(taken, undefined)),
        Effect.forkScoped,
      );
      yield* Effect.yieldNow;
      yield* topology.invalidate;
      yield* topology.invalidate;
      yield* Deferred.succeed(oldInitial, undefined);
      yield* topology.reconcile(0, oldInitial);
      yield* topology.reconcile(1, oldInitial);
      yield* Effect.yieldNow;
      expect(yield* Deferred.isDone(taken)).toBe(false);
      expect(yield* topology.revision).toBe(2);
      yield* topology.reconcile(2, initial);
      yield* Effect.yieldNow;
      expect(yield* Deferred.isDone(taken)).toBe(false);
      yield* Deferred.succeed(initial, undefined);
      expect((yield* Fiber.join(consumer)).work._tag).toBe("Full");
    }).pipe(Effect.scoped),
);

it.effect("abandons a cancelled context's uncompleted observation gate", () =>
  Effect.gen(function* () {
    const pending = yield* Ref.make(SyncState.full(SyncState.empty));
    const topology = yield* WatchTopology.make(pending);
    const cancelled = yield* Deferred.make<void>();
    yield* topology.reconcile(0, cancelled);
    const consumer = yield* topology.takePending.pipe(Effect.forkScoped);
    yield* Effect.yieldNow;
    yield* topology.invalidate;
    const initial = yield* Deferred.make<void>();
    yield* Deferred.succeed(initial, undefined);
    yield* topology.reconcile(1, initial);
    expect((yield* Fiber.join(consumer)).work._tag).toBe("Full");
    expect(yield* Deferred.isDone(cancelled)).toBe(false);
    yield* Ref.update(pending, SyncState.full);
    expect((yield* topology.takePending).work._tag).toBe("Full");
    expect((yield* topology.takePending).work._tag).toBe("None");
  }).pipe(Effect.scoped),
);

it.effect("does not consume edits or strand waiters after interruption", () =>
  Effect.gen(function* () {
    const pending = yield* Ref.make(SyncState.full(SyncState.empty));
    const topology = yield* WatchTopology.make(pending);
    const initial = yield* Deferred.make<void>();
    yield* topology.reconcile(0, initial);
    const cancelled = yield* topology.takePending.pipe(Effect.forkScoped);
    yield* Effect.yieldNow;
    yield* Fiber.interrupt(cancelled);
    expect((yield* Ref.get(pending)).work._tag).toBe("Full");
    yield* Deferred.succeed(initial, undefined);
    expect((yield* topology.takePending).work._tag).toBe("Full");
    yield* topology.invalidate;
    yield* topology.reconcile(1, initial);
    expect((yield* topology.takePending).work._tag).toBe("Full");
  }).pipe(Effect.scoped),
);
