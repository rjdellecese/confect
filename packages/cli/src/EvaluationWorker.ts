import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeWorkerRunner from "@effect/platform-node/NodeWorkerRunner";
import { Spec } from "@confect/core";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HashMap from "effect/HashMap";
import * as Ref from "effect/Ref";
import * as References from "effect/References";
import * as RpcServer from "effect/rpc/RpcServer";
import * as CodegenError from "./CodegenError";
import * as CompiledModule from "./CompiledModule";
import * as ConvexConfig from "./ConvexConfig";
import * as FunctionPaths from "./FunctionPaths";
import * as GenerationSnapshot from "./GenerationSnapshot";
import * as TableModule from "./TableModule";
import { fromBundlerError } from "./BuildError";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import {
  EvaluationError,
  requests,
  catchWorkerFailure,
  type RequestContext,
} from "./EvaluationProtocol";
import * as LeafModule from "./LeafModule";
import type { SpecModulePath } from "./SpecModulePath";
import { ProjectRoot } from "./ProjectRoot";

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
    catchWorkerFailure,
  );

const load = (url: string, displayPath: string) =>
  CompiledModule.namespace(url).pipe(
    Effect.mapError((error) => fromBundlerError(displayPath, error)),
  );

const handlers = requests.toLayer(
  Effect.gen(function* () {
    const specs = yield* Ref.make(
      HashMap.empty<SpecModulePath, LeafModule.LoadedLeafModule>(),
    );
    const getSpec = Effect.fn("EvaluationWorker.getSpec")(function* (
      path: SpecModulePath,
    ) {
      const leaf = HashMap.get(yield* Ref.get(specs), path);
      if (Option.isNone(leaf))
        return yield* new EvaluationError({
          diagnostic: `No prepared spec for ${path}`,
        });
      return leaf.value;
    });
    return {
      Previous: (request) =>
        evaluate(
          request,
          Effect.gen(function* () {
            const module = yield* load(request.url, "_generated/spec.ts");
            if (!Spec.isSpec(module.default))
              return yield* new EvaluationError({
                diagnostic: "_generated/spec.ts does not export a valid Spec",
              });
            return FunctionPaths.make(module.default);
          }),
        ),
      LoadSpec: (request) =>
        evaluate(
          request,
          Effect.gen(function* () {
            const module = yield* load(request.url, request.relativePath);
            const leaf = yield* LeafModule.parseSpec(
              yield* LeafModule.toLeafModule(request.relativePath),
              module.default,
              request.serverImporters,
            );
            yield* Ref.update(specs, HashMap.set(request.relativePath, leaf));
          }),
        ),
      Snapshot: (request) =>
        evaluate(
          request,
          Effect.gen(function* () {
            const leaves = yield* Effect.forEach(request.paths, getSpec);
            return yield* Effect.fromResult(
              request.previous === undefined
                ? GenerationSnapshot.fromLoadedLeaves(leaves)
                : GenerationSnapshot.update(request.previous, leaves),
            );
          }),
        ),
      ValidateImpl: (request) =>
        evaluate(
          request,
          Effect.gen(function* () {
            const leaf = yield* getSpec(request.specPath);
            const implPath = yield* LeafModule.implPathForSpec(
              request.specPath,
            );
            const module = yield* load(request.url, implPath);
            if (!request.importsSpec)
              return yield* new CodegenError.ImplMissingSpecImportError({
                implPath,
                expectedSpecPath: request.specPath,
              });
            yield* LeafModule.validateImplModule(leaf, module.default);
          }),
        ),
      ValidateTable: (request) =>
        evaluate(
          request,
          Effect.gen(function* () {
            const module = yield* load(request.url, request.relativePath);
            yield* TableModule.validateDefault(
              module.default,
              request.relativePath,
            );
          }),
        ),
      Components: (request) =>
        evaluate(
          request,
          Effect.gen(function* () {
            const module = yield* load(request.url, request.displayPath);
            return yield* ConvexConfig.parseInstalledComponents(
              module.default,
              request.displayPath,
            );
          }),
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
  NodeRuntime.runMain,
);
