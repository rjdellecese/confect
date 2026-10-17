import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeWorkerRunner from "@effect/platform-node/NodeWorkerRunner";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HashMap from "effect/HashMap";
import * as Ref from "effect/Ref";
import * as References from "effect/References";
import * as RpcServer from "effect/rpc/RpcServer";
import * as esbuild from "esbuild";
import * as CodegenError from "./CodegenError";
import * as CompiledModule from "./CompiledModule";
import { fromBundlerError } from "./BuildError";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import type { RequestContext } from "./Evaluation";
import { EvaluationError, requests, catchDiagnostic } from "./Evaluation";
import * as LeafModule from "./LeafModule";
import type { SpecModulePath } from "./SpecModulePath";
import { ProjectRoot } from "./ProjectRoot";
import {
  generateWithSnapshot,
  loadPreviousFunctionPaths,
  updateDeclarations,
} from "./confect/codegen";

const evaluate = <A, E, R>(
  requestContext: RequestContext,
  effect: Effect.Effect<A, E, R>,
) =>
  effect.pipe(
    Effect.provideService(
      References.MinimumLogLevel,
      requestContext.minimumLogLevel,
    ),
    Effect.provideService(ProjectRoot, {
      get: Effect.succeed(requestContext.projectRoot),
    }),
    Effect.provideService(ConfectDirectory, {
      get: Effect.succeed(requestContext.confectDirectory),
    }),
    Effect.provideService(ConvexDirectory, {
      get: Effect.succeed(requestContext.convexDirectory),
    }),
    catchDiagnostic,
  );

const handlers = requests.toLayer(
  Effect.gen(function* () {
    const specs = yield* Ref.make(
      HashMap.empty<SpecModulePath, LeafModule.LoadedLeafModule>(),
    );
    return {
      Previous: (requestContext) =>
        evaluate(requestContext, loadPreviousFunctionPaths),
      Generate: (requestContext) =>
        evaluate(
          requestContext,
          generateWithSnapshot.pipe(Effect.map(({ snapshot }) => snapshot)),
        ),
      LoadSpec: (request) =>
        evaluate(
          request,
          Effect.gen(function* () {
            const module = yield* CompiledModule.namespace(request.url).pipe(
              Effect.mapError((error) =>
                fromBundlerError(request.relativePath, error),
              ),
            );
            const leaf = yield* LeafModule.parseSpec(
              yield* LeafModule.toLeafModule(request.relativePath),
              module.default,
              request.serverImporters,
            );
            yield* Ref.update(specs, HashMap.set(request.relativePath, leaf));
          }),
        ),
      ValidateImpl: (request) =>
        evaluate(
          request,
          Effect.gen(function* () {
            const leaf = HashMap.get(yield* Ref.get(specs), request.specPath);
            if (Option.isNone(leaf))
              return yield* new EvaluationError({
                diagnostic: `No prepared spec for ${request.specPath}`,
              });
            const implPath = yield* LeafModule.implPathForSpec(
              request.specPath,
            );
            const module = yield* CompiledModule.namespace(request.url).pipe(
              Effect.mapError((error) => fromBundlerError(implPath, error)),
            );
            if (!request.importsSpec)
              return yield* new CodegenError.ImplMissingSpecImportError({
                implPath,
                expectedSpecPath: request.specPath,
              });
            yield* LeafModule.validateImplModule(leaf.value, module.default);
          }),
        ),
      Update: (request) =>
        evaluate(
          request,
          updateDeclarations(
            request.snapshot,
            request.declarations,
            request.paths,
          ),
        ),
    };
  }),
);

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
