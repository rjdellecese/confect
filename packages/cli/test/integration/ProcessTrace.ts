import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Semaphore from "effect/Semaphore";

const writes = Semaphore.makeUnsafe(1);

export const phases = [
  "SpawnStart",
  "Spawned",
  "SpawnFailed",
  "ReleaseStart",
  "ReleaseComplete",
  "WaitingForOutput",
  "OutputReceived",
  "ReadinessTimeout",
  "WaitingForExit",
  "Exited",
] as const;

export interface Record {
  readonly fixture: string;
  readonly command: "dev" | "codegen";
  readonly reporterPid: number;
  readonly pid: number | null;
  readonly timestamp: number;
  readonly phase: (typeof phases)[number];
  readonly attempt?: number;
  readonly code?: number;
}

export const serialize = (record: Record): string | undefined => {
  if (
    !/^consumer-[a-zA-Z0-9_-]{1,80}$/.test(record.fixture) ||
    !["dev", "codegen"].includes(record.command) ||
    !phases.includes(record.phase) ||
    !Number.isSafeInteger(record.reporterPid) ||
    !(record.pid === null || Number.isSafeInteger(record.pid)) ||
    !Number.isSafeInteger(record.timestamp) ||
    !(record.attempt === undefined || Number.isSafeInteger(record.attempt)) ||
    !(record.code === undefined || Number.isSafeInteger(record.code))
  )
    return undefined;
  return `${JSON.stringify({
    fixture: record.fixture,
    command: record.command,
    reporterPid: record.reporterPid,
    pid: record.pid,
    timestamp: record.timestamp,
    phase: record.phase,
    attempt: record.attempt,
    code: record.code,
  })}\n`;
};

export const maxBytes = 4 * 1024 * 1024;

export const make = (fixture: string, command: "dev" | "codegen") =>
  Effect.gen(function* () {
    const file = yield* Config.String("CONFECT_CLI_PROCESS_TRACE").pipe(
      Config.withDefault(""),
      Effect.catchCause(() => Effect.succeed("")),
    );
    const fs = yield* FileSystem.FileSystem;
    const record = (
      phase: Record["phase"],
      pid: number | null,
      details: Pick<Record, "attempt" | "code"> = {},
    ) =>
      file === ""
        ? Effect.void
        : Effect.gen(function* () {
            const line = serialize({
              fixture,
              command,
              reporterPid: process.pid,
              pid,
              timestamp: yield* Clock.currentTimeMillis,
              phase,
              ...details,
            });
            if (line === undefined) return;
            const size = yield* fs
              .stat(file)
              .pipe(Effect.map((stat) => Number(stat.size)));
            if (size + line.length > maxBytes) return;
            yield* fs.writeFileString(file, line, { flag: "a" });
          }).pipe((effect) => writes.withPermit(effect), Effect.ignoreCause);
    return { record };
  });

export const spawn = <A extends { readonly pid: number }, E, R>(
  trace: Effect.Success<ReturnType<typeof make>>,
  acquire: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    let pid: number | null = null;
    yield* Effect.addFinalizer(() =>
      pid === null ? Effect.void : trace.record("ReleaseComplete", pid),
    );
    yield* trace.record("SpawnStart", null);
    const handle = yield* acquire.pipe(
      Effect.onExit((exit) =>
        Exit.isFailure(exit) ? trace.record("SpawnFailed", null) : Effect.void,
      ),
    );
    pid = handle.pid;
    yield* Effect.addFinalizer(() => trace.record("ReleaseStart", handle.pid));
    yield* trace.record("Spawned", handle.pid);
    return handle;
  });
