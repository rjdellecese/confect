import * as NodeChildProcess from "node:child_process";
import nodeProcess from "node:process";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as DevSessionProcess from "./DevSessionProcess";
import {
  MissingSessionIpc,
  SessionTerminationError,
  SupervisorError,
  SessionExited,
  sessionMarker,
} from "./DevSessionProcess";

const RestartSignal = Schema.TaggedStruct("ConfectDevSessionRestart", {});
const isRestartSignal = Schema.is(RestartSignal);

export interface Bindings {
  readonly fork: (
    entrypoint: string,
    args: ReadonlyArray<string>,
    options: NodeChildProcess.ForkOptions,
  ) => NodeChildProcess.ChildProcess;
  readonly process: {
    readonly argv: ReadonlyArray<string>;
    readonly execArgv: Array<string>;
    readonly env: NodeJS.ProcessEnv;
    readonly connected: boolean;
    readonly send?:
      | ((
          message: typeof RestartSignal.Type,
          callback: (cause: Error | null) => void,
        ) => unknown)
      | undefined;
    readonly disconnect?: (() => void) | undefined;
    readonly once: (event: "disconnect", listener: () => void) => unknown;
    readonly off: (event: "disconnect", listener: () => void) => unknown;
  };
}

export const make = ({
  fork,
  process,
}: Bindings): DevSessionProcess.Service["Service"] => {
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
                    ? Deferred.succeed(
                        outcome,
                        yield* Ref.get(restartRequested),
                      )
                    : Deferred.fail(
                        outcome,
                        new SessionExited({ code, signal }),
                      );
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

  return DevSessionProcess.Service.of({
    runSession: runParentSession,
    connectToParent: Effect.acquireRelease(
      Effect.gen(function* () {
        if (typeof process.send !== "function")
          return yield* new MissingSessionIpc();
        if (!process.connected) return yield* Effect.interrupt;
        return {
          disconnected: parentDisconnected,
          requestRestart: sendRestart,
        };
      }),
      () =>
        Effect.sync(() => {
          if (process.connected) process.disconnect?.();
        }),
    ),
  });
};

export const layer = Layer.sync(DevSessionProcess.Service, () =>
  make({ fork: NodeChildProcess.fork, process: nodeProcess }),
);
