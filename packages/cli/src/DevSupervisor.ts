import * as Array from "effect/Array";
import * as Cause from "effect/Cause";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as DevSessionProcess from "./DevSessionProcess";

export class RestartRequested extends Schema.TaggedError<RestartRequested>()(
  "RestartRequested",
  {},
) {}

export const requestRestart = Effect.fail(new RestartRequested());

export const run = Effect.fn("DevSupervisor.run")(function* <A, E, R>(
  session: Effect.Effect<A, E, R>,
) {
  const processes = yield* DevSessionProcess.Service;
  if (
    (yield* Config.String(DevSessionProcess.sessionMarker).pipe(
      Config.withDefault(""),
    )) === "1"
  ) {
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const parent = yield* processes.connectToParent;
        return yield* Effect.scoped(session).pipe(
          Effect.asVoid,
          Effect.raceFirst(parent.disconnected),
          Effect.catchCauseIf(
            (cause) =>
              cause.reasons.length > 0 &&
              Array.every(
                cause.reasons,
                (reason) =>
                  Cause.isFailReason(reason) &&
                  Schema.is(RestartRequested)(reason.error),
              ),
            () => parent.requestRestart,
          ),
        );
      }),
    );
  }
  while (yield* processes.runSession) {}
});
