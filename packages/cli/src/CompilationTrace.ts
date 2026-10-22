import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";

const phases = [
  "Compilation.compile",
  "Compilation.verify",
  "CompilationInputs.check",
  "CompilationInputs.verify",
  "Test.wait",
  "CompilationContext.consume",
  "CompilationContext.rebuild",
  "CompilationContext.nativeRebuild",
  "CompilationContext.nativeStart",
  "CompilationContext.capture",
  "CompilationContext.publish",
  "CompilationContext.verify",
  "Evaluation.spec",
  "Evaluation.table",
  "Evaluation.impl",
  "Evaluation.components",
  "Evaluation.snapshot",
  "Dev.sync",
  "Dev.verify",
  "Dev.rescan",
  "Dev.drain",
  "Dev.pending",
  "Dev.notification",
  "Dev.history",
  "Dev.readiness",
] as const;

type Phase = (typeof phases)[number];

export interface Details {
  readonly context?: number;
  readonly revision?: number;
  readonly roots?: number;
  readonly outputs?: number;
  readonly attempt?: number;
  readonly events?: number;
  readonly optional?: number;
  readonly profile?: "modules" | "component-config";
  readonly mode?: "Once" | "Watch";
  readonly work?: "None" | "Reconcile" | "Full" | "Impls" | "Declarations";
  readonly operation?: "Generate" | "Update" | "Validate";
}

export interface Record extends Details {
  readonly phase: Phase;
  readonly pid: number;
  readonly id: number;
  readonly timestamp: number;
  readonly event: "Begin" | "End";
  readonly outcome?: "Success" | "Failure" | "Interrupted";
}

export const serialize = (record: Record): string | undefined => {
  if (
    !phases.includes(record.phase) ||
    ![
      record.pid,
      record.id,
      record.timestamp,
      record.context,
      record.revision,
      record.roots,
      record.outputs,
      record.attempt,
      record.events,
      record.optional,
    ].every(
      (value) =>
        value === undefined || (Number.isSafeInteger(value) && value >= 0),
    ) ||
    !["Begin", "End"].includes(record.event) ||
    !(
      record.outcome === undefined ||
      ["Success", "Failure", "Interrupted"].includes(record.outcome)
    ) ||
    !(
      record.profile === undefined ||
      ["modules", "component-config"].includes(record.profile)
    ) ||
    !(record.mode === undefined || ["Once", "Watch"].includes(record.mode)) ||
    !(
      record.work === undefined ||
      ["None", "Reconcile", "Full", "Impls", "Declarations"].includes(
        record.work,
      )
    ) ||
    !(
      record.operation === undefined ||
      ["Generate", "Update", "Validate"].includes(record.operation)
    )
  )
    return undefined;
  return `${JSON.stringify({
    phase: record.phase,
    pid: record.pid,
    id: record.id,
    timestamp: record.timestamp,
    event: record.event,
    outcome: record.outcome,
    context: record.context,
    revision: record.revision,
    roots: record.roots,
    outputs: record.outputs,
    attempt: record.attempt,
    events: record.events,
    optional: record.optional,
    profile: record.profile,
    mode: record.mode,
    work: record.work,
    operation: record.operation,
  })}\n`;
};

interface Tracer {
  readonly span: <A, E, R>(
    phase: Phase,
    effect: Effect.Effect<A, E, R>,
    details?: Details,
  ) => Effect.Effect<A, E, R>;
}

const disabled: Tracer = { span: (_phase, effect) => effect };

export const Service = Context.Reference<Tracer>(
  "@confect/cli/CompilationTrace",
  {
    defaultValue: () => disabled,
  },
);

export const maxBytes = 512 * 1024;

export const make = Effect.gen(function* () {
  const directory = yield* Config.String(
    "CONFECT_CLI_PHASE_TRACE_DIRECTORY",
  ).pipe(Config.withDefault(""));
  if (directory === "") return disabled;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const clock = yield* Clock.Clock;
  const file = path.join(directory, `phase-${process.pid}.jsonl`);
  yield* fs.writeFileString(file, "", { flag: "a" });
  let bytes = Number((yield* fs.stat(file)).size);
  let nextId = 0;
  const lock = yield* Semaphore.make(1);
  const write = (
    phase: Phase,
    id: number,
    event: Record["event"],
    details: Details,
    outcome?: Record["outcome"],
  ) =>
    lock
      .withPermit(
        Effect.gen(function* () {
          const line = serialize({
            ...details,
            phase,
            pid: process.pid,
            id,
            event,
            timestamp: yield* clock.currentTimeMillis,
            ...(outcome === undefined ? {} : { outcome }),
          });
          if (line === undefined || bytes + line.length > maxBytes) return;
          yield* fs.writeFileString(file, line, { flag: "a" });
          bytes += line.length;
        }),
      )
      .pipe(Effect.ignoreCause);
  return {
    span: (phase, effect, details = {}) =>
      Effect.gen(function* () {
        const id = ++nextId;
        yield* write(phase, id, "Begin", details);
        return yield* effect.pipe(
          Effect.onExit((exit) =>
            write(
              phase,
              id,
              "End",
              details,
              Exit.isSuccess(exit)
                ? "Success"
                : Cause.hasInterruptsOnly(exit.cause)
                  ? "Interrupted"
                  : "Failure",
            ),
          ),
        );
      }),
  } satisfies Tracer;
}).pipe(Effect.catchCause(() => Effect.succeed(disabled)));

export const layer = Layer.effect(Service, make);
