import * as NodeWorker from "@effect/platform-node/NodeWorker";
import { fork } from "node:child_process";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcClient from "effect/rpc/RpcClient";
import type { RpcClientError } from "effect/rpc/RpcClientError";
import * as RpcGroup from "effect/rpc/RpcGroup";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import { FunctionPaths } from "./FunctionPaths";
import { ImplModulePath } from "./ImplModulePath";
import { ProjectRoot } from "./ProjectRoot";

export const Directories = Schema.Struct({
  projectRoot: Schema.String,
  confectDirectory: Schema.String,
  convexDirectory: Schema.String,
});
export type Directories = typeof Directories.Type;

export class EvaluationError extends Schema.TaggedError<EvaluationError>()(
  "EvaluationError",
  { diagnostic: Schema.String },
) {}

export const requests = RpcGroup.make(
  Rpc.make("Previous", {
    payload: Directories,
    success: FunctionPaths,
    error: EvaluationError,
  }),
  Rpc.make("Generate", {
    payload: Directories,
    success: FunctionPaths,
    error: EvaluationError,
  }),
  Rpc.make("Validate", {
    payload: Schema.Struct({
      ...Directories.fields,
      paths: Schema.Array(ImplModulePath),
    }),
    success: Schema.Void,
    error: EvaluationError,
  }),
);

const withWorker = Effect.fn("Evaluation.withWorker")(function* <A>(
  run: (
    client: RpcClient.RpcClient<RpcGroup.Rpcs<typeof requests>, RpcClientError>,
    directories: Directories,
  ) => Effect.Effect<A, EvaluationError | RpcClientError>,
) {
  const directories = {
    projectRoot: yield* ProjectRoot.get,
    confectDirectory: yield* ConfectDirectory.get,
    convexDirectory: yield* ConvexDirectory.get,
  };
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const child = yield* Effect.acquireRelease(
        Effect.sync(() =>
          fork(new URL("../dist/EvaluationWorker.mjs", import.meta.url), {
            serialization: "advanced",
          }),
        ),
        (evaluator) =>
          Effect.callback<void>((resume) => {
            if (evaluator.exitCode !== null || evaluator.signalCode !== null) {
              resume(Effect.void);
              return;
            }
            evaluator.once("exit", () => resume(Effect.void));
            evaluator.kill("SIGKILL");
          }),
      );
      return yield* Effect.gen(function* () {
        const client = yield* RpcClient.make(requests);
        return yield* run(client, directories);
      }).pipe(
        Effect.provide(
          RpcClient.layerProtocolWorker({ size: 1 }).pipe(
            Layer.provide(NodeWorker.layer(() => child)),
          ),
        ),
      );
    }),
  ).pipe(
    Effect.catchTags({
      WorkerError: (error) =>
        Effect.fail(new EvaluationError({ diagnostic: error.message })),
      RpcClientError: (error) =>
        Effect.fail(new EvaluationError({ diagnostic: error.message })),
    }),
  );
});

export const loadPreviousFunctionPaths = withWorker((client, directories) =>
  client.Previous(directories),
);

export const generate = withWorker((client, directories) =>
  client.Generate(directories),
);

export const validate = (paths: ReadonlyArray<ImplModulePath>) =>
  withWorker((client, directories) =>
    client.Validate({ ...directories, paths }),
  );

export const catchAndLog = <A, R>(
  effect: Effect.Effect<A, EvaluationError, R>,
): Effect.Effect<Option.Option<A>, never, R> =>
  effect.pipe(
    Effect.asSome,
    Effect.catchTag("EvaluationError", ({ diagnostic }) =>
      Console.error(diagnostic).pipe(Effect.as(Option.none<A>())),
    ),
  );
