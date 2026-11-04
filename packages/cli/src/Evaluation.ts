import { dual } from "effect/Function";
import * as NodeWorker from "@effect/platform-node/NodeWorker";
import { fork } from "node:child_process";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as LogLevel from "effect/LogLevel";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as References from "effect/References";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcClient from "effect/rpc/RpcClient";
import type { RpcClientError } from "effect/rpc/RpcClientError";
import * as RpcGroup from "effect/rpc/RpcGroup";
import type * as Array from "effect/Array";
import * as EntryPoint from "./EntryPoint";
import * as GenerationSnapshot from "./GenerationSnapshot";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import { FunctionPaths } from "./FunctionPaths";
import { ImplModulePath } from "./ImplModulePath";
import { ProjectRoot } from "./ProjectRoot";

export const RequestContext = Schema.Struct({
  projectRoot: Schema.String,
  confectDirectory: Schema.String,
  convexDirectory: Schema.String,
  minimumLogLevel: Schema.Literals(LogLevel.values),
});
export type RequestContext = typeof RequestContext.Type;

export class EvaluationError extends Schema.TaggedError<
  EvaluationError,
  { readonly brand: unique symbol }
>()("EvaluationError", { diagnostic: Schema.String }) {}

/**
 * @internal
 */
export const requests = RpcGroup.make(
  Rpc.make("Previous", {
    payload: RequestContext,
    success: FunctionPaths,
    error: EvaluationError,
  }),
  Rpc.make("Generate", {
    payload: RequestContext,
    success: GenerationSnapshot.GenerationSnapshot,
    error: EvaluationError,
  }),
  Rpc.make("Validate", {
    payload: Schema.Struct({
      ...RequestContext.fields,
      paths: Schema.Array(ImplModulePath),
    }),
    success: Schema.Void,
    error: EvaluationError,
  }),
  Rpc.make("Update", {
    payload: Schema.Struct({
      ...RequestContext.fields,
      snapshot: GenerationSnapshot.GenerationSnapshot,
      declarations: Schema.NonEmptyArray(EntryPoint.Declaration),
      paths: Schema.Array(ImplModulePath),
    }),
    success: GenerationSnapshot.GenerationSnapshot,
    error: EvaluationError,
  }),
);

const withWorker = Effect.fn("Evaluation.withWorker")(function* <A>(
  run: (
    client: RpcClient.RpcClient<RpcGroup.Rpcs<typeof requests>, RpcClientError>,
    requestContext: RequestContext,
  ) => Effect.Effect<A, EvaluationError | RpcClientError>,
) {
  const requestContext = {
    projectRoot: yield* ProjectRoot.get,
    confectDirectory: yield* ConfectDirectory.get,
    convexDirectory: yield* ConvexDirectory.get,
    minimumLogLevel: yield* References.MinimumLogLevel,
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
      const workerContext = yield* Layer.build(
        RpcClient.layerProtocolWorker({ size: 1 }).pipe(
          Layer.provide(NodeWorker.layer(() => child)),
        ),
      );
      return yield* Effect.gen(function* () {
        const client = yield* RpcClient.make(requests);
        return yield* run(client, requestContext);
      }).pipe(Effect.provideContext(workerContext));
    }),
  ).pipe(
    Effect.catchTags({
      WorkerError: (error) =>
        Effect.fail(EvaluationError.make({ diagnostic: error.message })),
      RpcClientError: (error) =>
        Effect.fail(EvaluationError.make({ diagnostic: error.message })),
    }),
  );
});

/**
 * @internal
 */
export const loadPreviousFunctionPaths = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  if (
    !(yield* fs.exists(path.join(confectDirectory, "_generated", "spec.ts")))
  ) {
    return FunctionPaths.make(HashSet.empty());
  }
  return yield* withWorker((client, requestContext) =>
    client.Previous(requestContext),
  );
});

export const generateSnapshot = withWorker((client, requestContext) =>
  client.Generate(requestContext),
);

export const generate = generateSnapshot.pipe(
  Effect.map(GenerationSnapshot.functionPaths),
);

export const updateDeclarations: {
  (
    declarations: Array.NonEmptyReadonlyArray<EntryPoint.Declaration>,
    paths: ReadonlyArray<ImplModulePath>,
  ): (
    snapshot: GenerationSnapshot.GenerationSnapshot,
  ) => Effect.Effect<
    GenerationSnapshot.GenerationSnapshot,
    EvaluationError,
    ConfectDirectory | ConvexDirectory | ProjectRoot
  >;
  (
    snapshot: GenerationSnapshot.GenerationSnapshot,
    declarations: Array.NonEmptyReadonlyArray<EntryPoint.Declaration>,
    paths: ReadonlyArray<ImplModulePath>,
  ): Effect.Effect<
    GenerationSnapshot.GenerationSnapshot,
    EvaluationError,
    ConfectDirectory | ConvexDirectory | ProjectRoot
  >;
} = dual(
  3,
  (
    snapshot: GenerationSnapshot.GenerationSnapshot,
    declarations: Array.NonEmptyReadonlyArray<EntryPoint.Declaration>,
    paths: ReadonlyArray<ImplModulePath>,
  ) =>
    withWorker((client, requestContext) =>
      client.Update({
        ...requestContext,
        snapshot,
        declarations,
        paths,
      }),
    ),
);

export const validate = (paths: ReadonlyArray<ImplModulePath>) =>
  withWorker((client, requestContext) =>
    client.Validate({ ...requestContext, paths }),
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
