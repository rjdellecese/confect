import { fork } from "node:child_process";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { NativeRequest, Request } from "./Protocol.ts";
import { EvaluationFailed, Response } from "./Protocol.ts";

const failure = (cause: unknown): EvaluationFailed =>
  new EvaluationFailed({
    message: cause instanceof Error ? cause.message : String(cause),
  });

const evaluateChild = (
  request: Request | NativeRequest,
): Effect.Effect<unknown, EvaluationFailed> =>
  Effect.acquireUseRelease(
    Effect.try({
      try: () => {
        const child = fork(new URL("./RunnerWorker.ts", import.meta.url), [], {
          serialization: "advanced",
          execArgv: [],
          stdio: ["ignore", "ignore", "ignore", "ipc"],
        });
        let closed = false;
        child.once("close", () => {
          closed = true;
        });
        return { child, isClosed: () => closed };
      },
      catch: failure,
    }),
    ({ child }) =>
      Effect.callback<unknown, EvaluationFailed>((resume) => {
        child.once("error", (cause) => resume(Effect.fail(failure(cause))));
        child.once("close", (code, signal) =>
          resume(
            Effect.fail(
              new EvaluationFailed({
                message: `Evaluation worker exited without a response (code ${code}, signal ${signal})`,
              }),
            ),
          ),
        );
        child.once("message", (message: unknown) =>
          resume(
            Schema.decodeUnknownEffect(Response)(message).pipe(
              Effect.mapError(failure),
              Effect.flatMap((response) =>
                response._tag === "Success"
                  ? Effect.succeed(response.value)
                  : Effect.fail(
                      new EvaluationFailed({ message: response.message }),
                    ),
              ),
            ),
          ),
        );
        try {
          child.send(request, (cause) => {
            if (cause) resume(Effect.fail(failure(cause)));
          });
        } catch (cause) {
          resume(Effect.fail(failure(cause)));
        }
      }),
    ({ child, isClosed }) =>
      Effect.callback<void, EvaluationFailed>((resume) => {
        const finish = () => {
          child.removeAllListeners();
          resume(Effect.void);
        };
        if (isClosed()) return finish();
        child.once("close", finish);
        try {
          if (child.exitCode === null && child.signalCode === null)
            child.kill("SIGKILL");
        } catch (cause) {
          resume(Effect.fail(failure(cause)));
        }
      }),
  );

export const evaluate = Effect.fn("Runner.evaluate")(
  (request: Request): Effect.Effect<unknown, EvaluationFailed> =>
    evaluateChild(request),
);

export const evaluateNative = Effect.fn("Runner.evaluateNative")(
  (request: NativeRequest): Effect.Effect<unknown, EvaluationFailed> =>
    evaluateChild(request),
);
