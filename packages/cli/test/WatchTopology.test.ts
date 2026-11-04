import { assert, expect, it } from "@effect/vitest";
import * as EntryPoint from "@confect/cli/EntryPoint";
import * as WatchTopology from "@confect/cli/WatchTopology";
import * as SyncState from "@confect/cli/SyncState";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";

it.effect(
  "gates targeted invalidations without losing concurrent or full work",
  () =>
    Effect.gen(function* () {
      const spec = EntryPoint.parse("notes.spec.ts");
      const impl = EntryPoint.parse("other.impl.ts");
      assert(spec._tag === "Some");
      assert(impl._tag === "Some");
      const pending = yield* Ref.make(SyncState.empty);
      const topology = yield* WatchTopology.make(pending);
      const initial = yield* Deferred.make<void>();
      yield* Deferred.succeed(initial, undefined);
      yield* topology.reconcile(0, initial);
      yield* topology.invalidateEntry(spec.value);
      yield* topology.invalidateEntry(impl.value);
      const taken = yield* Deferred.make<void>();
      const consumer = yield* topology.takePending.pipe(
        Effect.tap(() => Deferred.succeed(taken, undefined)),
        Effect.forkScoped,
      );
      yield* topology.reconcile(1, initial);
      yield* Effect.yieldNow;
      const done = yield* Deferred.isDone(taken);
      expect(done).toBe(false);
      yield* topology.reconcile(2, initial);
      const joined = yield* Fiber.join(consumer);
      expect(joined).toEqual(
        SyncState.add(SyncState.empty, [spec.value, impl.value]),
      );
      yield* topology.invalidate;
      yield* topology.invalidateEntry(spec.value);
      yield* topology.reconcile(4, initial);
      expect((yield* topology.takePending).work._tag).toBe("Full");
      const current = yield* Ref.get(pending);
      expect(current).toEqual(SyncState.empty);
    }).pipe(Effect.scoped),
);

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
    const done2 = yield* Deferred.isDone(taken);
    expect(done2).toBe(false);
    yield* topology.reconcile(0, initial);
    yield* Effect.yieldNow;
    const done3 = yield* Deferred.isDone(taken);
    expect(done3).toBe(false);
    yield* Deferred.succeed(initial, undefined);
    expect((yield* Fiber.join(consumer)).work._tag).toBe("Full");
    const current2 = yield* Ref.get(pending);
    expect(current2).toEqual(SyncState.empty);
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
      const done4 = yield* Deferred.isDone(taken);
      expect(done4).toBe(false);
      const actual = yield* topology.revision;
      expect(actual).toBe(2);
      yield* topology.reconcile(2, initial);
      yield* Effect.yieldNow;
      const done5 = yield* Deferred.isDone(taken);
      expect(done5).toBe(false);
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
    const done6 = yield* Deferred.isDone(cancelled);
    expect(done6).toBe(false);
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
