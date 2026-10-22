import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import * as ByteSize from "effect/ByteSize";
import * as Cause from "effect/Cause";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as TestConsole from "effect/testing/TestConsole";
import * as ProcessTrace from "./ProcessTrace";

layer(
  Layer.merge(
    NodeServices.layer,
    ConfigProvider.layer(
      ConfigProvider.fromUnknown({ CONFECT_CLI_PROCESS_TRACE: "" }),
    ),
  ),
)("ProcessTrace", (it) => {
  it.effect("serializes only synthetic identity and whitelisted fields", () =>
    Effect.sync(() => {
      const record = {
        fixture: "consumer-test",
        command: "dev",
        reporterPid: 123,
        pid: 456,
        timestamp: 789,
        phase: "WaitingForOutput",
        attempt: 2,
        output: "private output",
        commandLine: "private command",
        environment: "private environment",
      } as const;
      expect(ProcessTrace.serialize(record)).toBe(
        '{"fixture":"consumer-test","command":"dev","reporterPid":123,"pid":456,"timestamp":789,"phase":"WaitingForOutput","attempt":2}\n',
      );
      expect(
        ProcessTrace.serialize({
          ...record,
          fixture: "/private/consumer-test",
        }),
      ).toBeUndefined();
      expect(
        ProcessTrace.serialize({ ...record, fixture: "consumer-test\nsecret" }),
      ).toBeUndefined();
    }),
  );

  it.effect("does no trace IO when opted out", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const calls = yield* Ref.make(0);
      const unexpected = Ref.update(calls, (count) => count + 1).pipe(
        Effect.andThen(Effect.die("unexpected trace IO")),
      );
      const trace = yield* ProcessTrace.make("consumer-test", "dev").pipe(
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          stat: () => unexpected,
          writeFileString: () => unexpected,
        }),
      );
      yield* trace.record("SpawnStart", null);
      expect(yield* Ref.get(calls)).toBe(0);
      expect(yield* TestConsole.errorLines).toEqual([]);
    }).pipe(
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
      Effect.provide(TestConsole.layer, { local: true }),
    ),
  );

  it.effect.each([
    "success",
    "failure",
    "interruption",
    "release defect",
  ] as const)("brackets spawner release without changing %s", (outcome) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped();
      const path = yield* Path.Path;
      const file = path.join(directory, "trace.jsonl");
      yield* fs.writeFileString(file, "");
      const events = yield* Ref.make<ReadonlyArray<string>>([]);
      const trace = yield* ProcessTrace.make("consumer-test", "codegen").pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              CONFECT_CLI_PROCESS_TRACE: file,
            }),
          ),
        ),
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          writeFileString: (_file, line) =>
            Ref.update(events, (previous) => [
              ...previous,
              Schema.decodeSync(
                Schema.fromJsonString(Schema.Struct({ phase: Schema.String })),
              )(line).phase,
            ]),
        }),
      );
      const acquire = Effect.acquireRelease(
        Ref.update(events, (previous) => [...previous, "acquire"]).pipe(
          Effect.as({ pid: 456 }),
        ),
        () =>
          Ref.update(events, (previous) => [...previous, "release"]).pipe(
            Effect.andThen(
              outcome === "release defect"
                ? Effect.die("release defect")
                : Effect.void,
            ),
          ),
      );
      const result = yield* Effect.gen(function* () {
        yield* ProcessTrace.spawn(trace, acquire);
        if (outcome === "failure")
          return yield* Effect.fail("original failure");
        if (outcome === "interruption") return yield* Effect.interrupt;
        return "original success";
      }).pipe(Effect.scoped, Effect.exit);
      expect(yield* Ref.get(events)).toEqual([
        "SpawnStart",
        "acquire",
        "Spawned",
        "ReleaseStart",
        "release",
        "ReleaseComplete",
      ]);
      if (outcome === "success")
        expect(result).toEqual(Exit.succeed("original success"));
      else {
        assert(Exit.isFailure(result));
        if (outcome === "interruption")
          expect(Cause.hasInterruptsOnly(result.cause)).toBe(true);
        else
          expect(result).toEqual(
            outcome === "failure"
              ? Exit.fail("original failure")
              : Exit.die("release defect"),
          );
      }
    }).pipe(Effect.scoped),
  );

  it.effect(
    "preserves spawn failures and ignores diagnostic write defects",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const trace = yield* ProcessTrace.make("consumer-test", "dev").pipe(
          Effect.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({
                CONFECT_CLI_PROCESS_TRACE: "trace.jsonl",
              }),
            ),
          ),
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            stat: () => Effect.die("diagnostic stat defect"),
          }),
        );
        const result = yield* ProcessTrace.spawn(
          trace,
          Effect.fail("spawn failure"),
        ).pipe(Effect.scoped, Effect.exit);
        expect(result).toEqual(Exit.fail("spawn failure"));
        const directory = yield* fs.makeTempDirectoryScoped();
        const file = (yield* Path.Path).join(directory, "trace.jsonl");
        yield* fs.writeFileString(file, "");
        const brokenWriter = yield* ProcessTrace.make(
          "consumer-test",
          "dev",
        ).pipe(
          Effect.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({ CONFECT_CLI_PROCESS_TRACE: file }),
            ),
          ),
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            writeFileString: () => Effect.die("diagnostic write defect"),
          }),
        );
        expect(
          yield* ProcessTrace.spawn(
            brokenWriter,
            Effect.succeed({ pid: 456 }),
          ).pipe(Effect.scoped, Effect.exit),
        ).toEqual(Exit.succeed({ pid: 456 }));
      }).pipe(Effect.scoped),
  );

  it.effect("stops appending when the trace reaches its byte budget", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const writes = yield* Ref.make(0);
      const directory = yield* fs.makeTempDirectoryScoped();
      const file = (yield* Path.Path).join(directory, "trace.jsonl");
      yield* fs.writeFileString(file, "");
      const trace = yield* ProcessTrace.make("consumer-test", "dev").pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({ CONFECT_CLI_PROCESS_TRACE: file }),
          ),
        ),
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          stat: (target) =>
            fs.stat(target).pipe(
              Effect.map((stat) => ({
                ...stat,
                size: ByteSize.bytes(ProcessTrace.maxBytes),
              })),
            ),
          writeFileString: () => Ref.update(writes, (count) => count + 1),
        }),
      );
      yield* trace.record("SpawnStart", null);
      expect(yield* Ref.get(writes)).toBe(0);
      expect(yield* fs.readFileString(file)).toBe("");
    }).pipe(Effect.scoped),
  );
});
