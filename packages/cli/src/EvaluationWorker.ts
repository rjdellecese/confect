import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeWorkerRunner from "@effect/platform-node/NodeWorkerRunner";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as RpcServer from "effect/rpc/RpcServer";
import * as esbuild from "esbuild";
import * as CodegenError from "./CodegenError";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import type { Directories } from "./Evaluation";
import { EvaluationError, requests } from "./Evaluation";
import { validateImplFiles } from "./LeafModule";
import { ProjectRoot } from "./ProjectRoot";
import {
  generateWithSnapshot,
  loadPreviousFunctionPaths,
  updateDeclarations,
} from "./confect/codegen";

const evaluate = <A, E, R>(
  directories: Directories,
  effect: Effect.Effect<A, E, R>,
) =>
  effect.pipe(
    Effect.provideService(ProjectRoot, {
      get: Effect.succeed(directories.projectRoot),
    }),
    Effect.provideService(ConfectDirectory, {
      get: Effect.succeed(directories.confectDirectory),
    }),
    Effect.provideService(ConvexDirectory, {
      get: Effect.succeed(directories.convexDirectory),
    }),
    Effect.catchCause((cause) => {
      const failure = Cause.findErrorOption(cause);
      return Effect.fail(
        new EvaluationError({
          diagnostic:
            Option.isSome(failure) && CodegenError.isCodegenError(failure.value)
              ? CodegenError.renderCodegenError(failure.value)
              : Cause.pretty(cause),
        }),
      );
    }),
  );

const handlers = requests.toLayer({
  Previous: (directories) => evaluate(directories, loadPreviousFunctionPaths),
  Generate: (directories) =>
    evaluate(
      directories,
      generateWithSnapshot.pipe(Effect.map(({ snapshot }) => snapshot)),
    ),
  Validate: (request) => evaluate(request, validateImplFiles(request.paths)),
  Update: (request) =>
    evaluate(
      request,
      updateDeclarations(request.snapshot, request.declarations, request.paths),
    ),
});

RpcServer.layer(requests).pipe(
  Layer.provide(handlers),
  Layer.provide(NodeServices.layer),
  Layer.provide(
    RpcServer.layerProtocolWorkerRunner.pipe(
      Layer.provide(NodeWorkerRunner.layer),
    ),
  ),
  Layer.launch,
  Effect.ensuring(Effect.promise(() => esbuild.stop())),
  NodeRuntime.runMain,
);
