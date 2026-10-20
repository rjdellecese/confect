import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import type * as esbuild from "esbuild";
import { BundlerError } from "../../../packages/cli/src/BuildError.ts";
import * as Compilation from "../../../packages/cli/src/Compilation.ts";
import * as CompilationBackend from "../../../packages/cli/src/CompilationBackend.ts";
import type * as CompilationConfig from "../../../packages/cli/src/CompilationConfig.ts";
import * as CompilationInputs from "../../../packages/cli/src/CompilationInputs.ts";
import * as CompilationState from "../../../packages/cli/src/CompilationState.ts";
import * as CompiledModule from "../../../packages/cli/src/CompiledModule.ts";
import * as NodeConditions from "../../../packages/cli/src/NodeConditions.ts";
import * as RspackCompiler from "./RspackCompiler.ts";
import * as RspackInputs from "./RspackInputs.ts";
import * as RspackOwnership from "./RspackOwnership.ts";
import * as RspackComponents from "./RspackComponents.ts";

class Failed extends Schema.TaggedError<Failed>()("RspackSessionFailed", {
  reason: Schema.Literals([
    "LegacyCompileUnsupported",
    "UnstableInputs",
    "StaleArtifact",
    "MissingEntry",
  ]),
  context: Schema.Finite,
}) {}

type Output = Effect.Success<ReturnType<typeof RspackCompiler.compileEntries>>;

interface Capture {
  readonly output: Output;
  readonly receipt: CompilationState.Receipt;
  readonly warnings: ReadonlyArray<esbuild.Message>;
}

interface NativeContext extends CompilationState.Topology {
  readonly discovery: CompilationConfig.Discovery;
  revision: number;
  values: CompilationState.Values;
  prepared: Option.Option<CompilationState.Receipt>;
  failed: boolean;
  validate: Effect.Effect<void, RspackInputs.Failed | RspackInputs.Changed>;
}

const bundlerError = (cause: unknown) =>
  Schema.is(BundlerError)(cause) ? cause : new BundlerError({ cause });

const normalizeLocation = (
  value: esbuild.PartialMessage["location"],
): esbuild.Location | null =>
  value
    ? {
        file: value.file ?? "",
        namespace: value.namespace ?? "file",
        line: value.line ?? 0,
        column: value.column ?? 0,
        length: value.length ?? 0,
        lineText: value.lineText ?? "",
        suggestion: value.suggestion ?? "",
      }
    : null;

export const layer = (options: Parameters<typeof Compilation.layer>[0]) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const owner = yield* Scope.Scope;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const services = Context.make(FileSystem.FileSystem, fs).pipe(
        Context.add(Path.Path, path),
      );
      const conditions = yield* NodeConditions.current.pipe(
        Effect.mapError(bundlerError),
      );
      const resolutionInputs = yield* CompilationInputs.make(
        options.mode,
        conditions,
      );
      yield* resolutionInputs.track(options.restartInputs ?? []);
      const ownedDirectories = yield* Effect.forEach(
        options.ownedDirectories,
        Compilation.canonicalPath,
      );
      const authoredFiles = yield* Effect.forEach(
        options.authoredFiles ?? [],
        Compilation.canonicalPath,
      );
      const ownership = RspackOwnership.make(path, {
        ownedDirectories,
        authoredFiles,
      });
      const events = yield* Queue.unbounded<
        CompilationState.Revision,
        BundlerError
      >();
      const lock = yield* Semaphore.make(1);
      const evidence = RspackInputs.make({ hideArtifacts: true });
      let contexts: ReadonlyArray<NativeContext> = [];
      let nextId = 0;
      let terminal: BundlerError | undefined;
      const artifacts = new WeakMap<Scope.Scope, Map<number, Capture>>();

      const ensure = Effect.gen(function* () {
        if (terminal) return yield* terminal;
        yield* resolutionInputs.ensure;
      });

      const publish = Effect.fn("RspackSession.publish")(function* (
        context: NativeContext,
        values: CompilationState.Values,
        errors: CompilationState.Revision["errors"],
        warnings: CompilationState.Revision["warnings"],
      ) {
        const receipt = {
          context: context.id,
          revision: ++context.revision,
          roots: context.roots,
        };
        const affectedRoots = CompilationState.changedRoots(
          context.values,
          values,
          context.roots,
        );
        context.values = values;
        context.failed = errors.length > 0;
        context.prepared = context.failed
          ? Option.none()
          : Option.some(receipt);
        yield* Queue.offer(events, {
          ...receipt,
          affectedRoots,
          errors,
          warnings,
        });
        return receipt;
      });

      const build = Effect.fn("RspackSession.build")(function* (
        context: NativeContext,
      ) {
        context.prepared = Option.none();
        const target = yield* Scope.Scope;
        for (let attempt = 0; attempt < 8; attempt++) {
          yield* ensure;
          yield* resolutionInputs.check;
          const generation = yield* resolutionInputs.generation;
          const scope = yield* Scope.fork(target, "sequential");
          const result = yield* RspackCompiler.compileEntries(context.roots, {
            inputs: resolutionInputs,
            conditions,
            configuration: context.discovery,
            ownership: { ownedDirectories, authoredFiles },
            profile: context.profile,
          }).pipe(
            Effect.provide(services),
            Effect.provideService(Scope.Scope, scope),
            Effect.result,
          );
          yield* resolutionInputs.check;
          if (Result.isSuccess(result)) {
            yield* Effect.forEach(result.success.graph.modules, (module) =>
              module.file &&
              path.isAbsolute(module.file) &&
              (!ownership.owns(module.file) ||
                (context.profile === "component-config" &&
                  RspackComponents.isDefinition(module.file)))
                ? resolutionInputs.trackSource(module.file)
                : Effect.void,
            );
          }
          if ((yield* resolutionInputs.generation) !== generation) {
            yield* Scope.close(scope, Exit.void);
            continue;
          }
          if (Result.isFailure(result)) {
            yield* Scope.close(scope, Exit.void);
            if (Schema.is(RspackInputs.Changed)(result.failure)) continue;
            if (!Schema.is(RspackCompiler.Failed)(result.failure))
              return yield* Effect.fail(result.failure);
            const observations = result.failure.observations ?? [];
            const checked = yield* evidence
              .validate(observations)
              .pipe(Effect.result);
            if (Result.isFailure(checked)) {
              if (Schema.is(RspackInputs.Changed)(checked.failure)) continue;
              return yield* checked.failure;
            }
            context.validate = evidence.validate(observations);
            const errors = [
              {
                id: "confect:rspack",
                pluginName: "confect:rspack",
                text: result.failure.message,
                location: null,
                notes: [],
                detail: result.failure,
              },
            ];
            const fingerprint = CompilationState.fingerprintFailure(
              errors.map(({ id, pluginName, text, location, notes }) => ({
                id,
                pluginName,
                text,
                location,
                notes,
              })),
              Object.fromEntries(
                observations.map((item) => [
                  JSON.stringify([item.method, item.path]),
                  item.fingerprint,
                ]),
              ),
            );
            const receipt = yield* publish(
              context,
              Object.fromEntries(
                context.roots.map((root) => [root, fingerprint]),
              ),
              errors,
              [],
            );
            return yield* new CompilationState.Failed({
              cause: result.failure,
              receipt,
            });
          }
          const checked = yield* result.success.validate.pipe(Effect.result);
          if (Result.isFailure(checked)) {
            yield* Scope.close(scope, Exit.void);
            if (Schema.is(RspackInputs.Changed)(checked.failure)) continue;
            return yield* checked.failure;
          }
          context.validate = evidence.validate(result.success.observations);
          const warnings: ReadonlyArray<esbuild.Message> = [
            ...context.discovery.warnings.map((warning) => ({
              id: warning.id ?? "",
              pluginName: warning.pluginName ?? "",
              text: warning.text ?? "",
              location: normalizeLocation(warning.location),
              notes: (warning.notes ?? []).map((note) => ({
                text: note.text ?? "",
                location: normalizeLocation(note.location),
              })),
              detail: warning.detail,
            })),
            ...result.success.warnings,
          ];
          const receipt = yield* publish(
            context,
            result.success.fingerprints,
            [],
            warnings,
          );
          return {
            output: result.success,
            receipt,
            warnings,
          } satisfies Capture;
        }
        return yield* new Failed({
          reason: "UnstableInputs",
          context: context.id,
        });
      });

      const verifyContext = Effect.fn("RspackSession.verifyContext")(function* (
        context: NativeContext,
      ) {
        const checked = yield* context.validate.pipe(Effect.result);
        if (Result.isSuccess(checked)) return;
        if (!Schema.is(RspackInputs.Changed)(checked.failure))
          return yield* checked.failure;
        yield* build(context).pipe(
          Effect.scoped,
          Effect.catchTag("CompilationFailed", () => Effect.void),
        );
      });

      const verify = lock
        .withPermit(
          Effect.gen(function* () {
            yield* ensure;
            yield* resolutionInputs.check;
            yield* Effect.forEach(contexts, verifyContext);
            yield* resolutionInputs.check;
          }),
        )
        .pipe(Effect.mapError(bundlerError));

      if ((options.mode ?? "Watch") === "Watch") {
        yield* verify.pipe(
          Effect.repeat(Schedule.spaced("250 millis")),
          Effect.catch((error) =>
            Effect.gen(function* () {
              if (Schema.is(CompilationInputs.RestartRequired)(error.cause))
                return;
              terminal = error;
              yield* Queue.fail(events, error);
            }),
          ),
          Effect.forkIn(owner),
        );
      }

      const compilation = Compilation.Service.of({
        ownedDirectories,
        authoredFiles,
        conditions,
        resolutionInputs,
        events: Stream.fromQueue(events),
        restarts: resolutionInputs.events,
        restartRequired: resolutionInputs.pending,
        reset: lock.withPermit(
          Effect.sync(() => {
            contexts = [];
          }),
        ),
        verify,
        topology: lock.withPermit(
          Effect.sync(() =>
            contexts.map(({ id, profile, configuration, roots }) => ({
              id,
              profile,
              configuration,
              roots,
            })),
          ),
        ),
        preparedRevisions: lock.withPermit(
          Effect.sync(() =>
            contexts.flatMap((context) =>
              Option.isSome(context.prepared) ? [context.prepared.value] : [],
            ),
          ),
        ),
        compile: () =>
          Effect.fail(
            bundlerError(
              new Failed({ reason: "LegacyCompileUnsupported", context: 0 }),
            ),
          ),
      });

      const prepare = Effect.fn("RspackSession.prepare")(
        function* (request: CompilationBackend.Preparation) {
          yield* ensure;
          const lexicalEntry = path.resolve(request.entry);
          const requestedRoots = [
            ...new Set(request.roots.map((root) => path.resolve(root))),
          ];
          if (!requestedRoots.includes(lexicalEntry))
            return yield* new Failed({ reason: "MissingEntry", context: 0 });
          const discovery = yield* resolutionInputs.configuration(lexicalEntry);
          const matching: string[] = [];
          for (const root of requestedRoots) {
            const other = yield* resolutionInputs.configuration(root);
            if (other.configuration === discovery.configuration)
              matching.push(root);
          }
          const roots = [
            ...new Set(
              yield* Effect.forEach(matching, Compilation.canonicalPath),
            ),
          ].sort((left, right) => left.localeCompare(right));
          const entry = yield* Compilation.canonicalPath(lexicalEntry);
          for (const root of roots) yield* resolutionInputs.trackSource(root);
          yield* resolutionInputs.check;
          let selected = contexts.find(
            (context) =>
              CompilationState.compatible(
                context,
                request.profile,
                roots,
                discovery.configuration,
              ) &&
              (!context.failed || context.roots.length === roots.length),
          );
          if (!selected) {
            selected = {
              id: ++nextId,
              profile: request.profile,
              configuration: discovery.configuration,
              roots,
              discovery,
              revision: 0,
              values: {},
              prepared: Option.none(),
              failed: false,
              validate: Effect.void,
            };
            contexts = [
              ...CompilationState.retain(contexts, selected),
              selected,
            ];
          }
          const context = selected;
          const supplied = yield* Effect.serviceOption(
            CompiledModule.ArtifactScope,
          );
          const scope = Option.isSome(supplied)
            ? supplied.value
            : yield* Scope.Scope;
          let cached = artifacts.get(scope);
          if (!cached) {
            cached = new Map();
            artifacts.set(scope, cached);
            yield* Scope.addFinalizer(
              scope,
              Effect.sync(() => {
                artifacts.delete(scope);
              }),
            );
          }
          const previous = cached.get(context.id);
          const expected = yield* Compilation.expectedRevision(context.id);
          const capture =
            previous ??
            (yield* build(context).pipe(
              Effect.provideService(Scope.Scope, scope),
              Effect.catchTag("CompilationFailed", Compilation.fail(entry)),
            ));
          const checked = yield* capture.output.validate.pipe(Effect.result);
          if (Result.isFailure(checked)) {
            if (!Schema.is(RspackInputs.Changed)(checked.failure))
              return yield* checked.failure;
            yield* verifyContext(context);
            return yield* new Failed({
              reason: "StaleArtifact",
              context: context.id,
            });
          }
          yield* ensure;
          yield* resolutionInputs.check;
          cached.set(context.id, capture);
          if (!previous)
            contexts = [...CompilationState.retain(contexts, context), context];
          const url = capture.output.urls[entry];
          if (!url)
            return yield* new Failed({
              reason: "MissingEntry",
              context: context.id,
            });
          const origin =
            previous &&
            Option.isSome(expected) &&
            expected.value.revision > capture.receipt.revision
              ? undefined
              : { ...capture.receipt, roots: [entry] };
          const modules = new Map(
            capture.output.graph.modules.map((module) => [module.id, module]),
          );
          const reachable = new Set<string>();
          const pending = [capture.output.graph.roots[entry]];
          for (let index = 0; index < pending.length; index++) {
            const id = pending[index];
            if (reachable.has(id)) continue;
            reachable.add(id);
            pending.push(
              ...(modules.get(id)?.imports.map((edge) => edge.id) ?? []),
            );
          }
          return {
            url,
            graph: {
              nodes: capture.output.graph.modules
                .filter((module) => reachable.has(module.id))
                .map((module) => {
                  const imports = module.imports.map((edge) => ({
                    id: edge.id,
                    ...(edge.request !== undefined
                      ? { original: edge.request }
                      : {}),
                  }));
                  return module.file && path.isAbsolute(module.file)
                    ? { id: module.id, path: module.file, imports }
                    : { id: module.id, imports };
                }),
            },
            warnings: capture.warnings,
            ...(origin ? { origin } : {}),
          } satisfies CompiledModule.NativeArtifact;
        },
        (effect) =>
          lock
            .withPermit(effect)
            .pipe(Effect.provide(services), Effect.mapError(bundlerError)),
      );
      return Context.make(Compilation.Service, compilation).pipe(
        Context.add(
          CompilationBackend.Service,
          CompilationBackend.Service.of({ prepare }),
        ),
      );
    }),
  );
