import * as NodeWorker from "@effect/platform-node/NodeWorker";
import { fork } from "node:child_process";
import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as References from "effect/References";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as RpcClient from "effect/rpc/RpcClient";
import { RpcClientError } from "effect/rpc/RpcClientError";
import { WorkerError } from "effect/workers/WorkerError";
import type * as RpcGroup from "effect/rpc/RpcGroup";
import * as Bundler from "./Bundler";
import * as CompiledModule from "./CompiledModule";
import * as CodegenError from "./CodegenError";
import * as ConvexConfig from "./ConvexConfig";
import type * as GenerationSnapshot from "./GenerationSnapshot";
import * as LeafModule from "./LeafModule";
import * as SpecModulePath from "./SpecModulePath";
import type { ImplModulePath } from "./ImplModulePath";
import type { TableModule } from "./TableModule";
import { fromBundlerError } from "./BuildError";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import { ProjectRoot } from "./ProjectRoot";
import {
  EvaluationError,
  requests,
  type RequestContext,
} from "./EvaluationProtocol";
import { logCoalescedBuildWarnings } from "./log";

export class ModuleEvaluation extends Context.Service<
  ModuleEvaluation,
  {
    readonly client: RpcClient.RpcClient<
      RpcGroup.Rpcs<typeof requests>,
      RpcClientError
    >;
    readonly requestContext: RequestContext;
  }
>()("@confect/cli/EvaluationSession/ModuleEvaluation") {}

export const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const current = yield* Effect.serviceOption(ModuleEvaluation);
      if (Option.isSome(current))
        return yield* effect.pipe(
          Effect.provideService(ModuleEvaluation, current.value),
        );
      const requestContext = {
        projectRoot: yield* ProjectRoot.get,
        confectDirectory: yield* ConfectDirectory.get,
        convexDirectory: yield* ConvexDirectory.get,
        minimumLogLevel: yield* References.MinimumLogLevel,
      };
      const artifactScope = yield* Scope.Scope;
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
                if (
                  evaluator.exitCode !== null ||
                  evaluator.signalCode !== null
                ) {
                  resume(Effect.void);
                  return;
                }
                evaluator.once("exit", () => resume(Effect.void));
                evaluator.kill("SIGKILL");
              }),
          );
          return yield* Effect.gen(function* () {
            const client = yield* RpcClient.make(requests);
            return yield* effect.pipe(
              Effect.provideService(ModuleEvaluation, {
                client,
                requestContext,
              }),
              Effect.provideService(
                CompiledModule.ArtifactScope,
                artifactScope,
              ),
            );
          }).pipe(
            Effect.provide(
              RpcClient.layerProtocolWorker({ size: 1 }).pipe(
                Layer.provide(NodeWorker.layer(() => child)),
              ),
            ),
          );
        }),
      );
    }),
  ).pipe(
    Effect.catchIf(
      (error): error is Extract<typeof error, RpcClientError | WorkerError> =>
        Schema.is(RpcClientError)(error) || Schema.is(WorkerError)(error),
      (error) =>
        Effect.fail(new EvaluationError({ diagnostic: error.message })),
    ),
  );

const compile = Effect.fn("EvaluationSession.compile")(function* (
  relativePath: string,
) {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  return yield* Bundler.compile(
    path.resolve(confectDirectory, relativePath),
  ).pipe(Effect.mapError((error) => fromBundlerError(relativePath, error)));
});

export const withBatch = <A, E, R>(
  paths: ReadonlyArray<string>,
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    return yield* Bundler.withBatch(
      paths.map((relative) => path.resolve(confectDirectory, relative)),
      effect,
    );
  });

export const loadSpecs = Effect.fn("EvaluationSession.loadSpecs")(function* (
  paths: ReadonlyArray<SpecModulePath.SpecModulePath>,
) {
  const { client, requestContext } = yield* ModuleEvaluation;
  return yield* withBatch(
    paths,
    Effect.forEach(
      paths,
      (relativePath) =>
        Effect.gen(function* () {
          const artifact = yield* compile(relativePath);
          yield* client
            .LoadSpec({
              ...requestContext,
              relativePath,
              url: artifact.url,
              serverImporters: yield* LeafModule.serverImporters(artifact),
            })
            .pipe(
              Effect.ensuring(logCoalescedBuildWarnings(artifact.warnings)),
              Effect.ensuring(CompiledModule.consume(artifact)),
            );
          return yield* LeafModule.toLeafModule(relativePath);
        }),
      { concurrency: 4 },
    ),
  );
});

export const snapshot = Effect.fn("EvaluationSession.snapshot")(function* (
  paths: ReadonlyArray<SpecModulePath.SpecModulePath>,
  previous?: GenerationSnapshot.GenerationSnapshot,
) {
  const { client, requestContext } = yield* ModuleEvaluation;
  return yield* client.Snapshot({
    ...requestContext,
    paths,
    ...(previous === undefined ? {} : { previous }),
  });
});

export const validateImpls = Effect.fn("EvaluationSession.validateImpls")(
  function* (leaves: ReadonlyArray<LeafModule.LeafModule>) {
    const { client, requestContext } = yield* ModuleEvaluation;
    const path = yield* Path.Path;
    const pairs = yield* Effect.forEach(leaves, (leaf) =>
      LeafModule.implPathForSpec(leaf.relativePath).pipe(
        Effect.map((implPath) => ({
          implPath,
          specPath: SpecModulePath.SpecModulePath.make(leaf.relativePath),
        })),
      ),
    );
    yield* withBatch(
      pairs.map(({ implPath }) => implPath),
      Effect.forEach(
        pairs,
        ({ implPath, specPath }) =>
          Effect.gen(function* () {
            const artifact = yield* compile(implPath);
            yield* client
              .ValidateImpl({
                ...requestContext,
                specPath,
                url: artifact.url,
                importsSpec: yield* Bundler.directlyImports(
                  artifact,
                  path.resolve(requestContext.confectDirectory, implPath),
                  path.resolve(requestContext.confectDirectory, specPath),
                ),
              })
              .pipe(
                Effect.ensuring(logCoalescedBuildWarnings(artifact.warnings)),
                Effect.ensuring(CompiledModule.consume(artifact)),
              );
          }),
        { concurrency: 4, discard: true },
      ),
    );
  },
);

export const withImplFiles = Effect.fn("EvaluationSession.withImplFiles")(
  function* <A, E, R>(
    paths: ReadonlyArray<ImplModulePath>,
    use: (
      leaves: ReadonlyArray<LeafModule.LeafModule>,
    ) => Effect.Effect<A, E, R>,
  ) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    const specPaths = paths.map(SpecModulePath.fromImpl);
    return yield* withBatch(
      Array.flatMap(paths, (implPath) => [
        implPath,
        SpecModulePath.fromImpl(implPath),
      ]),
      Effect.gen(function* () {
        yield* Effect.forEach(paths, (implPath) =>
          Effect.gen(function* () {
            const specPath = SpecModulePath.fromImpl(implPath);
            if (!(yield* fs.exists(path.resolve(confectDirectory, specPath))))
              return yield* new CodegenError.MissingSpecFileError({
                implPath,
                expectedSpecPath: specPath,
              });
            if (!(yield* fs.exists(path.resolve(confectDirectory, implPath))))
              return yield* new CodegenError.MissingImplFileError({
                specPath,
                expectedImplPath: implPath,
              });
          }),
        );
        return yield* use(yield* loadSpecs(specPaths));
      }),
    );
  },
);

export const discoverLeaves = LeafModule.discoverLeafSpecFiles.pipe(
  Effect.flatMap((files) => Effect.forEach(files, LeafModule.toLeafModule)),
);

export const validateSiblings = Effect.fn("EvaluationSession.validateSiblings")(
  function* (leaves: ReadonlyArray<LeafModule.LeafModule>) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    yield* Effect.forEach(leaves, (leaf) =>
      Effect.gen(function* () {
        const implPath = yield* LeafModule.implPathForSpec(leaf.relativePath);
        if (!(yield* fs.exists(path.resolve(confectDirectory, implPath))))
          return yield* new CodegenError.MissingImplFileError({
            specPath: leaf.relativePath,
            expectedImplPath: implPath,
          });
      }),
    );
    yield* LeafModule.validateOrphanImpls(
      leaves.map(({ relativePath }) => relativePath),
    );
  },
);

export const validateTables = Effect.fn("EvaluationSession.validateTables")(
  function* (tables: ReadonlyArray<TableModule>) {
    const { client, requestContext } = yield* ModuleEvaluation;
    yield* withBatch(
      tables.map(({ relativePath }) => relativePath),
      Effect.forEach(
        tables,
        ({ relativePath }) =>
          Effect.gen(function* () {
            const artifact = yield* compile(relativePath);
            yield* client
              .ValidateTable({
                ...requestContext,
                relativePath,
                url: artifact.url,
              })
              .pipe(
                Effect.ensuring(logCoalescedBuildWarnings(artifact.warnings)),
                Effect.ensuring(CompiledModule.consume(artifact)),
              );
          }),
        { concurrency: 4, discard: true },
      ),
    );
  },
);

export const components = Effect.fn("EvaluationSession.components")(function* (
  absolutePath: string,
  displayPath: string,
) {
  const path = yield* Path.Path;
  const { client, requestContext } = yield* ModuleEvaluation;
  const artifact = yield* Bundler.compile(absolutePath, {
    profile: "component-config",
    plugins: [ConvexConfig.componentConfigPlugin(path)],
  }).pipe(Effect.mapError((error) => fromBundlerError(displayPath, error)));
  return yield* client
    .Components({ ...requestContext, displayPath, url: artifact.url })
    .pipe(
      Effect.ensuring(logCoalescedBuildWarnings(artifact.warnings)),
      Effect.ensuring(CompiledModule.consume(artifact)),
    );
});

export const previous = Effect.fn("EvaluationSession.previous")(function* (
  absolutePath: string,
) {
  const { client, requestContext } = yield* ModuleEvaluation;
  const artifact = yield* Bundler.compile(absolutePath).pipe(
    Effect.mapError((error) => fromBundlerError(absolutePath, error)),
  );
  return yield* client
    .Previous({ ...requestContext, url: artifact.url })
    .pipe(
      Effect.ensuring(logCoalescedBuildWarnings(artifact.warnings)),
      Effect.ensuring(CompiledModule.consume(artifact)),
    );
});
