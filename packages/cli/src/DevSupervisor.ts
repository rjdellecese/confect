import * as Array from "effect/Array";
import * as Cause from "effect/Cause";
import * as Config from "effect/Config";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Runtime from "effect/Runtime";
import * as Schema from "effect/Schema";
import * as Stdio from "effect/Stdio";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";

const sessionMarker = "CONFECT_INTERNAL_DEV_SESSION";
const restartExitCode = 75;

export class RestartRequested extends Schema.TaggedError<RestartRequested>()(
  "RestartRequested",
  {},
) {}

export const requestRestart = Effect.fail(new RestartRequested());

export class SessionRestart extends Schema.TaggedError<SessionRestart>()(
  "DevSessionRestart",
  {},
) {
  readonly [Runtime.errorExitCode] = restartExitCode;
  readonly [Runtime.errorReported] = false;
}

export class SessionExited extends Schema.TaggedError<SessionExited>()(
  "DevSessionExited",
  { code: Schema.Finite },
) {}

export class MissingEntrypoint extends Schema.TaggedError<MissingEntrypoint>()(
  "DevSessionMissingEntrypoint",
  {},
) {}

export const run = Effect.fn("DevSupervisor.run")(function* <A, E, R>(
  session: Effect.Effect<A, E, R>,
) {
  const stdio = yield* Stdio.Stdio;
  if (
    (yield* Config.String(sessionMarker).pipe(Config.withDefault(""))) === "1"
  ) {
    return yield* Effect.scoped(session).pipe(
      Effect.asVoid,
      Effect.raceFirst(
        stdio.stdin.pipe(Stream.runDrain, Effect.andThen(Effect.interrupt)),
      ),
      Effect.catchCauseIf(
        (cause) =>
          cause.reasons.length > 0 &&
          Array.every(
            cause.reasons,
            (reason) =>
              Cause.isFailReason(reason) &&
              Schema.is(RestartRequested)(reason.error),
          ),
        () => Effect.fail(new SessionRestart()),
      ),
    );
  }

  const entrypoint = process.argv[1];
  if (entrypoint === undefined) return yield* new MissingEntrypoint();
  const args = yield* stdio.args;
  const spawner = yield* ChildProcessSpawner;
  const runSession = Effect.scoped(
    Effect.gen(function* () {
      const stopping = yield* Deferred.make<void>();
      const child = yield* spawner.spawn(
        ChildProcess.make(
          process.execPath,
          [...process.execArgv, entrypoint, ...args],
          {
            env: { [sessionMarker]: "1" },
            extendEnv: true,
            stdin: Stream.fromEffect(Deferred.await(stopping)).pipe(
              Stream.drain,
            ),
            stdout: "inherit",
            stderr: "inherit",
            forceKillAfter: "5 seconds",
          },
        ),
      );
      const exited = yield* Deferred.make<
        Effect.Success<typeof child.exitCode>,
        Effect.Error<typeof child.exitCode>
      >();
      yield* child.exitCode.pipe(
        Effect.exit,
        Effect.flatMap((exit) => Deferred.done(exited, exit)),
        Effect.forkScoped,
      );
      yield* Effect.addFinalizer(() =>
        Deferred.succeed(stopping, undefined).pipe(
          Effect.andThen(Deferred.await(exited)),
          Effect.timeoutOption("5 seconds"),
          Effect.ignore,
        ),
      );
      const code = yield* Deferred.await(exited);
      if (code === restartExitCode) return true;
      if (code !== 0) return yield* new SessionExited({ code });
      return false;
    }),
  );
  while (yield* runSession) {}
});
