import { fork } from "node:child_process";
import process from "node:process";
import * as Array from "effect/Array";
import * as Cause from "effect/Cause";
import * as Config from "effect/Config";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

const sessionMarker = "CONFECT_INTERNAL_DEV_SESSION";
const RestartSignal = Schema.TaggedStruct("ConfectDevSessionRestart", {});
const isRestartSignal = Schema.is(RestartSignal);

export class RestartRequested extends Schema.TaggedError<RestartRequested>()(
  "RestartRequested",
  {},
) {}

export const requestRestart = Effect.fail(new RestartRequested());

export class MissingSessionIpc extends Schema.TaggedError<MissingSessionIpc>()(
  "DevSessionMissingIpc",
  {},
) {}

export class SessionTerminationError extends Schema.TaggedError<SessionTerminationError>()(
  "DevSessionTerminationError",
  {
    pid: Schema.NullOr(Schema.Finite),
    reason: Schema.Literals(["SignalFailed", "SignalRejected", "ExitTimeout"]),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

export class SupervisorError extends Schema.TaggedError<SupervisorError>()(
  "DevSupervisorError",
  {
    operation: Schema.Literals(["Spawn", "Restart", "Terminate"]),
    cause: Schema.Defect(),
  },
) {}

export class SessionExited extends Schema.TaggedError<SessionExited>()(
  "DevSessionExited",
  {
    code: Schema.NullOr(Schema.Finite),
    signal: Schema.NullOr(Schema.String),
  },
) {}

const sendRestart = Effect.scoped(
  Effect.gen(function* () {
    if (!process.connected) return yield* Effect.interrupt;
    const acknowledged = yield* Deferred.make<void>();
    const runSync = Effect.runSyncWith(yield* Effect.context());
    const onDisconnect = () => {
      runSync(Deferred.succeed(acknowledged, undefined));
    };
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        process.once("disconnect", onDisconnect);
      }),
      () =>
        Effect.sync(() => {
          process.off("disconnect", onDisconnect);
        }),
    );
    yield* Effect.callback<void, SupervisorError | MissingSessionIpc>(
      (resume) => {
        if (typeof process.send !== "function") {
          resume(Effect.fail(new MissingSessionIpc()));
          return;
        }
        try {
          process.send(RestartSignal.make({}), (cause) => {
            resume(
              cause
                ? !process.connected
                  ? Effect.interrupt
                  : Effect.fail(
                      new SupervisorError({ operation: "Restart", cause }),
                    )
                : Effect.void,
            );
          });
        } catch (cause) {
          resume(
            !process.connected
              ? Effect.interrupt
              : Effect.fail(
                  new SupervisorError({ operation: "Restart", cause }),
                ),
          );
        }
      },
    );
    yield* Deferred.await(acknowledged);
  }),
);

const parentDisconnected = Effect.callback<never>((resume) => {
  if (!process.connected) {
    resume(Effect.interrupt);
    return;
  }
  const onDisconnect = () => resume(Effect.interrupt);
  process.once("disconnect", onDisconnect);
  return Effect.sync(() => {
    process.off("disconnect", onDisconnect);
  });
});

const runChild = <A, E, R>(session: Effect.Effect<A, E, R>) =>
  Effect.scoped(session).pipe(
    Effect.asVoid,
    Effect.raceFirst(parentDisconnected),
    Effect.catchCauseIf(
      (cause) =>
        cause.reasons.length > 0 &&
        Array.every(
          cause.reasons,
          (reason) =>
            Cause.isFailReason(reason) &&
            Schema.is(RestartRequested)(reason.error),
        ),
      () => sendRestart,
    ),
    Effect.ensuring(
      Effect.sync(() => {
        if (process.connected) process.disconnect?.();
      }),
    ),
  );

const runParentSession = Effect.scoped(
  Effect.gen(function* () {
    const entrypoint = process.argv[1];
    if (entrypoint === undefined) {
      return yield* new SupervisorError({
        operation: "Spawn",
        cause: "The CLI entrypoint is missing",
      });
    }
    const terminated = yield* Deferred.make<void>();
    const outcome = yield* Deferred.make<
      boolean,
      SupervisorError | SessionExited
    >();
    const restartRequested = yield* Ref.make(false);
    const runSync = Effect.runSyncWith(yield* Effect.context());
    const child = yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          const session = fork(entrypoint, process.argv.slice(2), {
            execArgv: process.execArgv,
            env: { ...process.env, [sessionMarker]: "1" },
            stdio: ["inherit", "inherit", "inherit", "ipc"],
          });
          const onMessage = (message: unknown) => {
            if (!isRestartSignal(message)) return;
            runSync(
              Ref.set(restartRequested, true).pipe(
                Effect.andThen(
                  Effect.try({
                    try: () => {
                      if (session.connected) session.disconnect();
                    },
                    catch: (cause) =>
                      new SupervisorError({ operation: "Restart", cause }),
                  }),
                ),
                Effect.catch((error) => Deferred.fail(outcome, error)),
              ),
            );
          };
          session.on("message", onMessage);
          session.on("error", (cause) => {
            runSync(
              Deferred.fail(
                outcome,
                new SupervisorError({ operation: "Spawn", cause }),
              ),
            );
          });
          const onExit = (
            code: number | null,
            signal: NodeJS.Signals | null,
          ) => {
            runSync(
              Effect.gen(function* () {
                yield* Deferred.succeed(terminated, undefined);
                yield* code === 0 && signal === null
                  ? Deferred.succeed(outcome, yield* Ref.get(restartRequested))
                  : Deferred.fail(outcome, new SessionExited({ code, signal }));
              }),
            );
          };
          session.once("exit", onExit);
          session.once("close", onExit);
          return { session, onMessage };
        },
        catch: (cause) => new SupervisorError({ operation: "Spawn", cause }),
      }),
      ({ session }) =>
        Effect.gen(function* () {
          if (yield* Deferred.isDone(terminated)) return;
          const stopped = yield* Effect.try({
            try: () => {
              if (session.connected) session.disconnect();
            },
            catch: (cause) =>
              new SupervisorError({ operation: "Terminate", cause }),
          }).pipe(Effect.result);
          const exited = Result.isSuccess(stopped)
            ? yield* Deferred.await(terminated).pipe(
                Effect.timeoutOption("5 seconds"),
              )
            : Option.none();
          if (Option.isNone(exited)) {
            const killed = yield* Effect.try({
              try: () => session.kill("SIGKILL"),
              catch: (cause) =>
                new SupervisorError({ operation: "Terminate", cause }),
            }).pipe(Effect.result);
            const reaped = yield* Deferred.await(terminated).pipe(
              Effect.timeoutOption("5 seconds"),
            );
            if (Option.isNone(reaped)) {
              return yield* Effect.die(
                new SessionTerminationError({
                  pid: session.pid ?? null,
                  reason: Result.isFailure(killed)
                    ? "SignalFailed"
                    : killed.success
                      ? "ExitTimeout"
                      : "SignalRejected",
                  ...(Result.isFailure(killed)
                    ? { cause: killed.failure }
                    : {}),
                }),
              );
            }
          }
          if (Result.isFailure(stopped))
            return yield* Effect.die(stopped.failure);
        }),
    );
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        child.session.off("message", child.onMessage);
      }),
    );
    return yield* Deferred.await(outcome);
  }),
);

export const run = Effect.fn("DevSupervisor.run")(function* <A, E, R>(
  session: Effect.Effect<A, E, R>,
) {
  if (
    (yield* Config.String(sessionMarker).pipe(Config.withDefault(""))) === "1"
  ) {
    if (typeof process.send !== "function")
      return yield* new MissingSessionIpc();
    if (!process.connected) return yield* Effect.interrupt;
    return yield* runChild(session);
  }
  while (yield* runParentSession) {}
});
