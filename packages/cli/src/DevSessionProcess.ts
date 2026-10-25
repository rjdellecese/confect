import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";

export const sessionMarker = "CONFECT_INTERNAL_DEV_SESSION";

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

export interface ParentConnection {
  readonly disconnected: Effect.Effect<never>;
  readonly requestRestart: Effect.Effect<
    void,
    SupervisorError | MissingSessionIpc
  >;
}

export class Service extends Context.Service<
  Service,
  {
    readonly runSession: Effect.Effect<
      boolean,
      SupervisorError | SessionExited
    >;
    readonly connectToParent: Effect.Effect<
      ParentConnection,
      MissingSessionIpc,
      Scope.Scope
    >;
  }
>()("@confect/cli/DevSessionProcess/Service") {}
