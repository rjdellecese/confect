import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import * as ByteSize from "effect/ByteSize";
import * as Cause from "effect/Cause";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import * as CompilationTrace from "@confect/cli/CompilationTrace";

class TestFailure extends Schema.TaggedError<TestFailure>()(
  "TestFailure",
  {},
) {}

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped();
  const file = path.join(directory, `phase-${process.pid}.jsonl`);
  const make = (filesystem = fs) =>
    CompilationTrace.make.pipe(
      Effect.provideService(FileSystem.FileSystem, filesystem),
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            CONFECT_CLI_PHASE_TRACE_DIRECTORY: directory,
          }),
        ),
      ),
    );
  const records = fs.readFileString(file).pipe(
    Effect.flatMap((contents) =>
      Effect.forEach(contents.trim().split("\n"), (line) =>
        Schema.decodeEffect(
          Schema.fromJsonString(
            Schema.Struct({
              phase: Schema.String,
              id: Schema.Int,
              event: Schema.String,
              timestamp: Schema.Finite,
              outcome: Schema.optionalKey(Schema.String),
            }),
          ),
        )(line),
      ),
    ),
  );
  return { fs, file, make, records };
});

layer(
  Layer.merge(
    NodeServices.layer,
    ConfigProvider.layer(ConfigProvider.fromUnknown({})),
  ),
)("CompilationTrace", (it) => {
  it.effect("serializes only static phases and allowed scalar metadata", () =>
    Effect.sync(() => {
      const record = {
        phase: "CompilationContext.capture",
        pid: 123,
        id: 1,
        timestamp: 1000,
        event: "Begin",
        context: 2,
        roots: 3,
        outputs: 4,
        profile: "modules",
        path: "/secret/source.ts",
        source: "secret source",
        error: "secret diagnostic",
        conditions: ["secret condition"],
      } as const;
      expect(CompilationTrace.serialize(record)).toBe(
        '{"phase":"CompilationContext.capture","pid":123,"id":1,"timestamp":1000,"event":"Begin","context":2,"roots":3,"outputs":4,"profile":"modules"}\n',
      );
      expect(
        CompilationTrace.serialize({ ...record, roots: NaN }),
      ).toBeUndefined();
      expect(
        CompilationTrace.serialize({ ...record, outputs: -1 }),
      ).toBeUndefined();
    }),
  );

  it.effect(
    "does no filesystem work when disabled and preserves the effect",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const calls = yield* Ref.make(0);
        const unexpected = Ref.update(calls, (count) => count + 1).pipe(
          Effect.andThen(Effect.die("unexpected IO")),
        );
        const trace = yield* CompilationTrace.make.pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            writeFileString: () => unexpected,
            stat: () => unexpected,
          }),
        );
        const effect = Effect.succeed(42);
        expect(trace.span("Dev.sync", effect)).toBe(effect);
        expect(yield* trace.span("Dev.sync", effect)).toBe(42);
        expect(yield* Ref.get(calls)).toBe(0);
      }),
  );

  it.effect(
    "keeps captured clock and sink when callbacks run with an empty context",
    () =>
      Effect.gen(function* () {
        const test = yield* fixture;
        yield* TestClock.setTime(1234);
        const trace = yield* test.make();
        yield* Effect.promise(() =>
          Effect.runPromiseWith(Context.empty())(
            trace.span("CompilationContext.capture", Effect.succeed(42)),
          ),
        );
        yield* trace.span("CompilationContext.consume", Effect.void);
        expect(yield* test.records).toEqual([
          {
            phase: "CompilationContext.capture",
            id: 1,
            timestamp: 1234,
            event: "Begin",
          },
          {
            phase: "CompilationContext.capture",
            id: 1,
            timestamp: 1234,
            event: "End",
            outcome: "Success",
          },
          {
            phase: "CompilationContext.consume",
            id: 2,
            timestamp: 1234,
            event: "Begin",
          },
          {
            phase: "CompilationContext.consume",
            id: 2,
            timestamp: 1234,
            event: "End",
            outcome: "Success",
          },
        ]);
      }).pipe(Effect.scoped),
  );

  it.effect(
    "records failures and defects without replacing or serializing them",
    () =>
      Effect.gen(function* () {
        const test = yield* fixture;
        const trace = yield* test.make();
        const failure = new TestFailure({});
        expect(
          yield* trace
            .span("Evaluation.table", Effect.fail(failure))
            .pipe(Effect.exit),
        ).toEqual(Exit.fail(failure));
        expect(
          yield* trace
            .span("Evaluation.spec", Effect.die("private defect"))
            .pipe(Effect.exit),
        ).toEqual(Exit.die("private defect"));
        expect(
          (yield* test.records)
            .filter((record) => record.event === "End")
            .map((record) => record.outcome),
        ).toEqual(["Failure", "Failure"]);
        expect(yield* test.fs.readFileString(test.file)).not.toContain(
          "private defect",
        );
        expect(yield* test.fs.readFileString(test.file)).not.toContain(
          "TestFailure",
        );
      }).pipe(Effect.scoped),
  );

  it.effect("preserves interruption and records its outcome", () =>
    Effect.gen(function* () {
      const test = yield* fixture;
      const trace = yield* test.make();
      const started = yield* Deferred.make<void>();
      const fiber = yield* trace
        .span(
          "Dev.sync",
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
          ),
        )
        .pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      const exit = yield* Fiber.await(fiber);
      assert(Exit.isFailure(exit));
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
      expect((yield* test.records).map((record) => record.outcome)).toEqual([
        undefined,
        "Interrupted",
      ]);
    }).pipe(Effect.scoped),
  );

  it.effect("diagnostic write defects leave original outcomes unchanged", () =>
    Effect.gen(function* () {
      const test = yield* fixture;
      const trace = yield* test.make({
        ...test.fs,
        writeFileString: (file, contents, options) =>
          contents === ""
            ? test.fs.writeFileString(file, contents, options)
            : Effect.die("diagnostic write defect"),
      });
      const failure = new TestFailure({});
      expect(yield* trace.span("Dev.sync", Effect.succeed(42))).toBe(42);
      expect(
        yield* trace.span("Dev.sync", Effect.fail(failure)).pipe(Effect.exit),
      ).toEqual(Exit.fail(failure));
      const exit = yield* trace
        .span("Dev.sync", Effect.interrupt)
        .pipe(Effect.exit);
      assert(Exit.isFailure(exit));
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    }).pipe(Effect.scoped),
  );

  it.effect("stops appending at the per-process budget", () =>
    Effect.gen(function* () {
      const test = yield* fixture;
      const writes = yield* Ref.make<ReadonlyArray<string>>([]);
      const trace = yield* test.make({
        ...test.fs,
        stat: (file) =>
          test.fs.stat(file).pipe(
            Effect.map((stat) => ({
              ...stat,
              size: ByteSize.bytes(CompilationTrace.maxBytes),
            })),
          ),
        writeFileString: (file, contents, options) =>
          test.fs
            .writeFileString(file, contents, options)
            .pipe(
              Effect.tap(() =>
                Ref.update(writes, (previous) => [...previous, contents]),
              ),
            ),
      });
      yield* trace.span("Dev.sync", Effect.void);
      expect(yield* Ref.get(writes)).toEqual([""]);
    }).pipe(Effect.scoped),
  );
});
