import * as NodePath from "@effect/platform-node/NodePath";
import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import * as LocalBackend from "./LocalBackend";

const output = (...chunks: ReadonlyArray<string>) =>
  Stream.fromIterable(chunks).pipe(
    Stream.map((chunk) => new TextEncoder().encode(chunk)),
  );

const makeSpawner = (
  attempts: ReadonlyArray<{
    readonly stdout?: Stream.Stream<Uint8Array>;
    readonly stderr: Stream.Stream<Uint8Array>;
    readonly exitCode: number;
  }>,
) => {
  const events: Array<string> = [];
  const pending = attempts.map((attempt) => ({
    ...attempt,
    closed: Deferred.makeUnsafe<void>(),
  }));
  let spawned = 0;
  const spawner = ChildProcessSpawner.make(() =>
    Effect.gen(function* () {
      const index = spawned++;
      const attempt = pending[index];
      if (attempt === undefined) {
        return yield* Effect.die("Unexpected backend startup attempt");
      }
      events.push(`start:${index}`);
      const stdout = attempt.stdout ?? Stream.empty;
      const stderr = attempt.stderr;
      return yield* Effect.acquireRelease(
        Effect.succeed(
          ChildProcessSpawner.makeHandle({
            pid: ChildProcessSpawner.ProcessId(index + 1),
            exitCode: Effect.succeed(
              ChildProcessSpawner.ExitCode(attempt.exitCode),
            ),
            isRunning: Effect.succeed(false),
            kill: () => Effect.void,
            stdin: Sink.drain,
            stdout,
            stderr,
            all: Stream.merge(stdout, stderr),
            getInputFd: () => Sink.drain,
            getOutputFd: () => Stream.empty,
            unref: Effect.succeed(Effect.void),
          }),
        ),
        () =>
          Effect.sync(() => events.push(`close:${index}`)).pipe(
            Effect.andThen(Deferred.succeed(attempt.closed, undefined)),
          ),
      );
    }),
  );
  return {
    events,
    advanceRetries: Effect.forEach(
      pending,
      (attempt) =>
        Deferred.await(attempt.closed).pipe(
          Effect.andThen(TestClock.adjust("5 seconds")),
        ),
      { discard: true },
    ),
    start: LocalBackend.make.pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      Effect.provide(NodePath.layer),
    ),
  };
};

it.effect("recognizes readiness split across process chunks", () =>
  Effect.gen(function* () {
    const { start, events } = makeSpawner([
      {
        stdout: output("Other output without a newline"),
        stderr: output("Convex func", "tions ready!\n").pipe(
          Stream.concat(Stream.never),
        ),
        exitCode: 0,
      },
    ]);
    yield* Effect.scoped(
      Effect.gen(function* () {
        const { client } = yield* start;
        expect(client.url).toBe("http://127.0.0.1:3210");
        expect(events).toEqual(["start:0"]);
      }),
    );
    expect(events).toEqual(["start:0", "close:0"]);
  }),
);

it.effect.each([
  "Failed to fetch latest backend version\n",
  "version.convex.dev returned 429: Too many requests\n",
  "version.convex.dev returned 503: Unavailable\n",
])("retries transient version lookup failures: %s", (diagnostic) =>
  Effect.gen(function* () {
    const { start, events, advanceRetries } = makeSpawner([
      {
        stderr: output(diagnostic.slice(0, 12), diagnostic.slice(12)),
        exitCode: 1,
      },
      { stderr: output("Convex functions ready!\n"), exitCode: 0 },
    ]);
    const fiber = yield* start.pipe(Effect.scoped, Effect.forkChild);
    yield* advanceRetries;
    yield* Fiber.join(fiber);
    expect(events).toEqual(["start:0", "close:0", "start:1", "close:1"]);
  }),
);

it.effect("stops after two retries without exposing child output", () =>
  Effect.gen(function* () {
    const { start, events, advanceRetries } = makeSpawner(
      Array.from({ length: 3 }, () => ({
        stderr: output(
          "version.convex.dev returned 503: PRIVATE_RESPONSE_BODY\n",
        ),
        exitCode: 1,
      })),
    );
    const fiber = yield* start.pipe(
      Effect.scoped,
      Effect.flip,
      Effect.forkChild,
    );
    yield* advanceRetries;
    const error = yield* Fiber.join(fiber);
    expect(error._tag).toBe("BackendVersionLookupError");
    expect(error.message).toContain("exited with code 1");
    expect(error.message).not.toContain("PRIVATE_RESPONSE_BODY");
    expect(events).toEqual([
      "start:0",
      "close:0",
      "start:1",
      "close:1",
      "start:2",
      "close:2",
    ]);
  }),
);

it.effect.each([
  "Deployment validation failed\n",
  "version.convex.dev returned 400: Invalid request\n",
])("does not retry other startup failures: %s", (diagnostic) =>
  Effect.gen(function* () {
    const { start, events } = makeSpawner([
      { stderr: output(diagnostic), exitCode: 1 },
    ]);
    const error = yield* start.pipe(Effect.scoped, Effect.flip);
    expect(error._tag).toBe("BackendNotReadyError");
    expect(error.message).toContain("exited with code 1");
    expect(events).toEqual(["start:0", "close:0"]);
  }),
);

it.effect("times out and closes a stalled process without retrying", () =>
  Effect.gen(function* () {
    const { start, events } = makeSpawner([
      { stderr: Stream.never, exitCode: 0 },
    ]);
    const fiber = yield* start.pipe(
      Effect.scoped,
      Effect.flip,
      Effect.forkChild,
    );
    yield* TestClock.adjust("90 seconds");
    const error = yield* Fiber.join(fiber);
    expect(error._tag).toBe("BackendNotReadyError");
    expect(error.message).toContain("within 90s");
    expect(events).toEqual(["start:0", "close:0"]);
  }),
);
