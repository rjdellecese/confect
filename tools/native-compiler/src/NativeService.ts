import { spawn } from "node:child_process";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as Fiber from "effect/Fiber";
import * as FiberMap from "effect/FiberMap";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Protocol from "./Protocol";

export class TransportError extends Schema.TaggedError<TransportError>()(
  "NativeTransportError",
  {
    operation: Schema.String,
    reason: Schema.String,
    stderr: Schema.String,
  },
) {}
export class Rejected extends Schema.TaggedError<Rejected>()("NativeRejected", {
  operation: Schema.String,
  code: Schema.String,
  message: Schema.String,
}) {}
export class NativeCallbackFailure extends Schema.TaggedError<NativeCallbackFailure>()(
  "NativeCallbackFailure",
  {
    callbackId: Schema.Finite,
    buildId: Schema.Finite,
    epoch: Schema.Finite,
    cause: Schema.Cause(Schema.Unknown, Schema.Unknown),
  },
) {}
export type Failure =
  | TransportError
  | Rejected
  | NativeCallbackFailure
  | Protocol.ProtocolError;
export interface TransportOptions {
  readonly args?: ReadonlyArray<string>;
  readonly cwd?: string;
  readonly timeoutMs?: number;
}
type RequestPayload = Protocol.Request extends infer T
  ? T extends Protocol.Request
    ? Omit<T, "id" | "version">
    : never
  : never;

export const make = Effect.fn("NativeService.make")(function* <E, R>(
  command: string,
  resolve: (
    request: Protocol.Resolve,
  ) => Effect.Effect<Protocol.Decision, E, R>,
  options: TransportOptions = {},
) {
  const runCallback = yield* FiberMap.makeRuntime<R, number, never, void>();
  const runTimer = yield* FiberMap.makeRuntime<never, string, never, void>();
  const timeout = options.timeoutMs ?? 10_000;
  if (
    !Number.isSafeInteger(timeout) ||
    timeout < 1 ||
    timeout > 2_147_483_647
  ) {
    return yield* new TransportError({
      operation: "options",
      reason: "Invalid timeout",
      stderr: "",
    });
  }
  const child = yield* Effect.try({
    try: () =>
      spawn(command, options.args ?? [], {
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        stdio: "pipe",
      }),
    catch: () =>
      new TransportError({
        operation: "spawn",
        reason: "Unable to spawn native service",
        stderr: "",
      }),
  });
  const closed = Deferred.makeUnsafe<void>();
  const decoder = new Protocol.FrameDecoder();
  let stderr = Buffer.alloc(0);
  let terminal: Failure | undefined;
  let isClosed = false;
  let disposed = false;
  let disposing = false;
  let created = false;
  let creating = false;
  let cancelPending = false;
  let nextId = 0;
  let lastBuild = 0;
  let lastEpoch = 0;
  let lastCallback = 0;
  let firstBuildCallback = 1;
  let active:
    | {
        buildId: number;
        epoch: number;
        cancelling: boolean;
        cancelCallbacks: boolean;
      }
    | undefined;
  let killTimer: Fiber.Fiber<void> | undefined;
  const pending = new Map<
    number,
    {
      tag: string;
      finish: (result: Effect.Effect<Protocol.Response, Failure>) => void;
      timer: Fiber.Fiber<void>;
    }
  >();
  const callbacks = new Map<
    number,
    {
      request: Protocol.Resolve;
      cancelling: boolean;
      fiber: Fiber.Fiber<void> | undefined;
    }
  >();
  const error = (operation: string, reason: string) =>
    new TransportError({ operation, reason, stderr: stderr.toString("utf8") });
  const fail = (failure: Failure) => {
    if (terminal) return;
    terminal = failure;
    for (const item of pending.values()) {
      item.timer.interruptUnsafe();
      item.finish(Effect.fail(failure));
    }
    pending.clear();
    for (const callback of callbacks.values())
      callback.fiber?.interruptUnsafe();
    if (!isClosed) {
      child.stdin.destroy();
      child.kill("SIGTERM");
      killTimer = runTimer(
        "kill",
        Effect.sleep(Math.min(timeout, 1_000)).pipe(
          Effect.andThen(
            Effect.sync(() => {
              child.kill("SIGKILL");
            }),
          ),
        ),
      );
    }
  };
  const write = (payload: RequestPayload, id: number): boolean => {
    if (terminal || isClosed) return false;
    const encoded = Protocol.encodeRequest({ ...payload, version: 1, id });
    if (Result.isFailure(encoded)) {
      fail(encoded.failure);
      return false;
    }
    if (
      child.stdin.writableLength + encoded.success.length >
      Protocol.maxFrameBytes + 4
    ) {
      fail(error("write", "Native input backpressure limit exceeded"));
      return false;
    }
    child.stdin.write(encoded.success, (cause) => {
      if (cause) fail(error("write", "Native stdin failed"));
    });
    return true;
  };
  const request = (
    payload: RequestPayload,
    tag: string,
  ): Effect.Effect<Protocol.Response, Failure> =>
    Effect.callback((resume) => {
      if (terminal || isClosed) {
        resume(
          Effect.fail(terminal ?? error(payload.tag, "Process is closed")),
        );
        return;
      }
      if (pending.size >= 3) {
        resume(Effect.fail(error(payload.tag, "Too many pending requests")));
        return;
      }
      const id = ++nextId;
      const timer = runTimer(
        `request:${id}`,
        Effect.sleep(timeout).pipe(
          Effect.andThen(
            Effect.sync(() =>
              fail(error(payload.tag, "Native response timeout")),
            ),
          ),
        ),
      );
      pending.set(id, { tag, finish: resume, timer });
      write(payload, id);
    });
  const receive = (message: Protocol.Response) => {
    if (terminal) return;
    if (message.tag === "Resolve") {
      if (
        !active ||
        active.cancelCallbacks ||
        message.buildId !== active.buildId ||
        message.epoch !== active.epoch ||
        message.callbackId <= lastCallback ||
        callbacks.size >= Protocol.maxCallbacks
      ) {
        fail(error("Resolve", "Unexpected callback identity or lifecycle"));
        return;
      }
      lastCallback = message.callbackId;
      const callback = {
        request: message,
        cancelling: false,
        fiber: undefined as Fiber.Fiber<void> | undefined,
      };
      callbacks.set(message.callbackId, callback);
      callback.fiber = runCallback(
        message.callbackId,
        Effect.suspend(() => resolve(message)).pipe(
          Effect.onExit((exit) =>
            Effect.sync(() => {
              callbacks.delete(message.callbackId);
              if (terminal) return;
              if (callback.cancelling) {
                write(
                  {
                    tag: "CallbackCancelled",
                    callbackId: message.callbackId,
                    buildId: message.buildId,
                    epoch: message.epoch,
                  },
                  ++nextId,
                );
              } else if (Exit.isSuccess(exit)) {
                write(
                  {
                    tag: "ResolveResult",
                    callbackId: message.callbackId,
                    buildId: message.buildId,
                    epoch: message.epoch,
                    decision: exit.value,
                  },
                  ++nextId,
                );
              } else
                fail(
                  new NativeCallbackFailure({
                    callbackId: message.callbackId,
                    buildId: message.buildId,
                    epoch: message.epoch,
                    cause: exit.cause,
                  }),
                );
            }),
          ),
          Effect.asVoid,
          Effect.ignoreCause,
        ),
      );
      return;
    }
    if (message.tag === "CancelCallbacks") {
      if (
        !active ||
        (!active.cancelling && !disposing) ||
        active.cancelCallbacks ||
        message.buildId !== active.buildId ||
        message.epoch !== active.epoch ||
        new Set(message.callbackIds).size !== message.callbackIds.length ||
        message.callbackIds.length > Protocol.maxCallbacks ||
        message.callbackIds.some(
          (id) => id > lastCallback || id < firstBuildCallback,
        ) ||
        [...callbacks.keys()].some((id) => !message.callbackIds.includes(id))
      ) {
        fail(error("CancelCallbacks", "Unexpected cancellation identities"));
        return;
      }
      active.cancelCallbacks = true;
      for (const id of message.callbackIds) {
        const callback = callbacks.get(id);
        if (callback) {
          callback.cancelling = true;
          callback.fiber?.interruptUnsafe();
        }
      }
      return;
    }
    const first = pending.entries().next().value;
    if (
      !first ||
      first[0] !== message.id ||
      (message.tag !== "Rejected" && first[1].tag !== message.tag)
    ) {
      fail(error("response", "Unknown, duplicate or out-of-order response"));
      return;
    }
    if (message.tag === "Capture") {
      if (
        !active ||
        message.buildId !== active.buildId ||
        message.epoch !== active.epoch ||
        callbacks.size > 0 ||
        (active.cancelCallbacks && message.status !== "Cancelled")
      ) {
        fail(error("Capture", "Mismatched or unsettled build"));
        return;
      }
      active = undefined;
    }
    if (
      message.tag === "Cancelled" &&
      (message.buildId !== lastBuild || active || callbacks.size > 0)
    ) {
      fail(error("Cancelled", "Build has not settled"));
      return;
    }
    if (message.tag === "Disposed") {
      if (active || callbacks.size > 0) {
        fail(error("Disposed", "Build has not settled"));
        return;
      }
      disposed = true;
    }
    first[1].timer.interruptUnsafe();
    pending.delete(message.id);
    first[1].finish(
      message.tag === "Rejected"
        ? Effect.fail(
            new Rejected({
              operation: first[1].tag,
              code: message.code,
              message: message.message,
            }),
          )
        : Effect.succeed(message),
    );
  };
  child.stdout.on("data", (chunk: Buffer) => {
    if (terminal) return;
    const result = decoder.push(chunk, (bytes) => {
      const decoded = Protocol.decodeResponse(bytes);
      if (Result.isFailure(decoded)) fail(decoded.failure);
      else receive(decoded.success);
    });
    if (Result.isFailure(result)) fail(result.failure);
  });
  child.stdout.on("end", () => {
    const end = decoder.finish();
    if (Result.isFailure(end)) fail(end.failure);
    else if (!disposed) fail(error("stdout", "Unexpected native stdout EOF"));
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = Buffer.concat([
      stderr,
      chunk.subarray(Math.max(0, chunk.length - 16_384)),
    ]).subarray(-16_384);
  });
  child.stdin.on("error", () => fail(error("stdin", "Native stdin failed")));
  child.stdout.on("error", () => fail(error("stdout", "Native stdout failed")));
  child.stderr.on("error", () => fail(error("stderr", "Native stderr failed")));
  child.on("error", () => fail(error("process", "Native process failed")));
  child.on("close", (code, signal) => {
    isClosed = true;
    killTimer?.interruptUnsafe();
    const end = decoder.finish();
    if (Result.isFailure(end)) fail(end.failure);
    else if (!disposed || code !== 0 || signal !== null)
      fail(error("close", `Unexpected native close (${code}, ${signal})`));
    Deferred.doneUnsafe(closed, Effect.void);
  });

  const awaitClose = Effect.gen(function* () {
    const graceful = yield* Deferred.await(closed).pipe(
      Effect.timeoutOption(timeout),
    );
    if (Option.isNone(graceful)) {
      fail(error("close", "Native process did not close"));
      child.kill("SIGKILL");
      const killed = yield* Deferred.await(closed).pipe(
        Effect.timeoutOption(timeout),
      );
      if (Option.isNone(killed))
        return yield* error("close", "Native process survived SIGKILL");
    }
    if (terminal) return yield* terminal;
  });
  const disposeOnce = yield* Effect.cached(
    Effect.gen(function* () {
      disposing = true;
      if (!terminal && !isClosed) {
        yield* request({ tag: "Dispose" }, "Disposed").pipe(
          Effect.catch((failure) => Effect.sync(() => fail(failure))),
        );
        child.stdin.end();
      }
      yield* awaitClose;
    }).pipe(Effect.uninterruptible),
  );
  const dispose = Effect.fn("NativeService.dispose")(() => disposeOnce);
  yield* Effect.addFinalizer(() =>
    dispose().pipe(
      Effect.catch(() =>
        Deferred.await(closed).pipe(
          Effect.timeoutOption(timeout),
          Effect.flatMap((settled) =>
            Option.isSome(settled)
              ? Effect.void
              : Effect.die(
                  error("close", "Native child remained alive after cleanup"),
                ),
          ),
        ),
      ),
    ),
  );

  const hello = yield* request(
    {
      tag: "Hello",
      esbuildVersion: Protocol.esbuildVersion,
      capabilities: Protocol.capabilities,
    },
    "Hello",
  );
  if (
    hello.tag !== "Hello" ||
    hello.esbuildVersion !== Protocol.esbuildVersion ||
    hello.maxFrameBytes !== Protocol.maxFrameBytes ||
    hello.maxCallbacks !== Protocol.maxCallbacks ||
    hello.capabilities.length !== Protocol.capabilities.length ||
    !Protocol.capabilities.every((capability) =>
      hello.capabilities.includes(capability),
    )
  ) {
    const failure = error(
      "Hello",
      "Native version or capabilities do not match",
    );
    fail(failure);
    return yield* failure;
  }
  const cancel = Effect.fn("NativeService.cancel")(function* (buildId: number) {
    if (!active || active.buildId !== buildId || active.cancelling || disposing)
      return yield* error("Cancel", "No matching cancellable build");
    active.cancelling = true;
    cancelPending = true;
    yield* request({ tag: "Cancel", buildId }, "Cancelled");
    cancelPending = false;
  }, Effect.uninterruptible);
  return {
    create: Effect.fn("NativeService.create")(function* (
      createOptions: Protocol.CreateOptions,
    ) {
      if (created || creating || disposing)
        return yield* error("Create", "Context already created or closing");
      creating = true;
      yield* request({ tag: "Create", options: createOptions }, "Created");
      created = true;
      creating = false;
    }, Effect.uninterruptible),
    rebuild: Effect.fn("NativeService.rebuild")(function* (snapshot: {
      readonly buildId: number;
      readonly epoch: number;
    }) {
      if (
        !created ||
        disposing ||
        cancelPending ||
        active ||
        snapshot.buildId <= lastBuild ||
        snapshot.epoch <= lastEpoch
      )
        return yield* error("Rebuild", "Invalid build lifecycle or epoch");
      lastBuild = snapshot.buildId;
      lastEpoch = snapshot.epoch;
      firstBuildCallback = lastCallback + 1;
      active = { ...snapshot, cancelling: false, cancelCallbacks: false };
      const response = yield* request(
        { tag: "Rebuild", ...snapshot },
        "Capture",
      ).pipe(
        Effect.onInterrupt(() =>
          active && !active.cancelling && !disposing
            ? cancel(snapshot.buildId).pipe(
                Effect.catch((failure) => Effect.sync(() => fail(failure))),
              )
            : Effect.void,
        ),
      );
      if (response.tag !== "Capture")
        return yield* error("Rebuild", "Expected capture");
      return response;
    }),
    cancel,
    dispose,
    diagnostics: () => ({
      stderr: stderr.toString("utf8"),
      pendingRequests: pending.size,
      pendingCallbacks: callbacks.size,
      closed: isClosed,
    }),
  };
});
