import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Scope from "effect/Scope";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import type * as esbuild from "esbuild";
import { BundlerError } from "./BuildError";
import * as CompilationContext from "./CompilationContext";
import * as CompilationState from "./CompilationState";
import * as CompiledModule from "./CompiledModule";
import * as CompilationInputs from "./CompilationInputs";
import * as NodeConditions from "./NodeConditions";

class FailedAttempts extends Context.Service<
  FailedAttempts,
  Ref.Ref<ReadonlyArray<CompilationState.Receipt>>
>()("@confect/cli/Compilation/FailedAttempts") {}

class PreparedRevisions extends Context.Service<
  PreparedRevisions,
  ReadonlyArray<CompilationState.Receipt>
>()("@confect/cli/Compilation/PreparedRevisions") {}

export interface Request {
  readonly roots: ReadonlyArray<string>;
  readonly profile: CompilationState.Profile;
  readonly configuration: string | undefined;
  readonly options: Omit<esbuild.BuildOptions, "tsconfig" | "tsconfigRaw">;
  readonly normalize: (metafile: esbuild.Metafile) => esbuild.Metafile;
}

export type { Mode } from "./CompilationState";

export class Service extends Context.Service<
  Service,
  {
    readonly ownedDirectories: ReadonlyArray<string>;
    readonly authoredFiles: ReadonlyArray<string>;
    readonly conditions: ReadonlyArray<string>;
    readonly events: Stream.Stream<CompilationState.Revision, BundlerError>;
    readonly restarts: Stream.Stream<
      CompilationInputs.RestartNotification,
      BundlerError
    >;
    readonly restartRequired: Effect.Effect<
      Option.Option<CompilationInputs.RestartNotification>
    >;
    readonly resolutionInputs: CompilationInputs.Inputs;
    readonly compile: (
      request: Request,
    ) => Effect.Effect<
      CompilationContext.Snapshot,
      BundlerError | CompilationState.Failed,
      Scope.Scope
    >;
    readonly reset: Effect.Effect<void>;
    readonly verify: Effect.Effect<void, BundlerError>;
    readonly topology: Effect.Effect<ReadonlyArray<CompilationState.Topology>>;
    readonly preparedRevisions: Effect.Effect<
      ReadonlyArray<CompilationState.Receipt>
    >;
  }
>()("@confect/cli/Compilation/Service") {}

export const canonicalPath = Effect.fn("Compilation.canonicalPath")(function* (
  file: string,
): Effect.fn.Return<string, never, Path.Path | FileSystem.FileSystem> {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const absolute = path.resolve(file);
  return yield* fs.realPath(absolute).pipe(
    Effect.catch(() => {
      const parent = path.dirname(absolute);
      return parent === absolute
        ? Effect.succeed(absolute)
        : canonicalPath(parent).pipe(
            Effect.map((directory) =>
              path.join(directory, path.basename(absolute)),
            ),
          );
    }),
  );
});

export const layer = (options: {
  readonly mode?: CompilationState.Mode;
  readonly ownedDirectories: ReadonlyArray<string>;
  readonly authoredFiles?: ReadonlyArray<string>;
  readonly restartInputs?: ReadonlyArray<string>;
}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const owner = yield* Scope.Scope;
      const conditions = yield* NodeConditions.current.pipe(
        Effect.mapError((cause) => new BundlerError({ cause })),
      );
      const resolutionInputs = yield* CompilationInputs.make(
        options.mode,
        conditions,
      );
      yield* resolutionInputs.track(options.restartInputs ?? []);
      const services = Context.make(
        FileSystem.FileSystem,
        yield* FileSystem.FileSystem,
      ).pipe(Context.add(Path.Path, yield* Path.Path));
      const events = yield* Queue.unbounded<
        CompilationState.Revision,
        BundlerError
      >();
      const ownedDirectories = yield* Effect.forEach(
        options.ownedDirectories,
        canonicalPath,
      );
      const authoredFiles = yield* Effect.forEach(
        options.authoredFiles ?? [],
        canonicalPath,
      );
      const lock = yield* Semaphore.make(1);
      const nextId = yield* Ref.make(0);
      const contexts = yield* Ref.make<
        ReadonlyArray<
          CompilationContext.CompilationContext & {
            readonly scope: Scope.Closeable;
          }
        >
      >([]);
      const reset = lock.withPermit(
        Effect.gen(function* () {
          const previous = yield* Ref.getAndSet(contexts, []);
          yield* Effect.forEach(previous, (context) =>
            Scope.close(context.scope, Exit.void),
          );
        }),
      );
      return Service.of({
        ownedDirectories,
        authoredFiles,
        conditions,
        events: Stream.fromQueue(events),
        restarts: resolutionInputs.events,
        restartRequired: resolutionInputs.pending,
        resolutionInputs,
        reset,
        preparedRevisions: lock.withPermit(
          Effect.gen(function* () {
            return Array.getSomes(
              yield* Effect.forEach(
                yield* Ref.get(contexts),
                (context) => context.preparedRevision,
              ),
            );
          }),
        ),
        verify: lock
          .withPermit(
            Effect.gen(function* () {
              yield* resolutionInputs.ensure;
              yield* Effect.forEach(
                yield* Ref.get(contexts),
                (context) => context.verify,
              );
              yield* resolutionInputs.check;
            }),
          )
          .pipe(
            Effect.mapError((cause) =>
              Schema.is(BundlerError)(cause)
                ? cause
                : new BundlerError({ cause }),
            ),
          ),
        topology: Ref.get(contexts).pipe(
          Effect.map((current) =>
            Array.map(current, ({ id, profile, configuration, roots }) => ({
              id,
              profile,
              configuration,
              roots,
            })),
          ),
        ),
        compile: Effect.fn("Compilation.compile")(
          function* (request) {
            yield* Effect.forEach(request.roots, resolutionInputs.trackSource);
            yield* resolutionInputs.ensure;
            const selected = yield* Effect.gen(function* () {
              const current = yield* Ref.get(contexts);
              const existing = yield* Effect.findFirst(current, (context) =>
                context.failed.pipe(
                  Effect.map(
                    (failed) =>
                      CompilationState.compatible(
                        context,
                        request.profile,
                        request.roots,
                        request.configuration,
                      ) &&
                      (!failed ||
                        context.roots.length === request.roots.length),
                  ),
                ),
              );
              if (Option.isSome(existing)) return existing.value;
              const topology = {
                id: yield* Ref.updateAndGet(nextId, (id) => id + 1),
                profile: request.profile,
                configuration: request.configuration,
                roots: request.roots,
              };
              const retained = CompilationState.retain(current, topology);
              const scope = yield* Scope.fork(owner, "sequential");
              const created = yield* CompilationContext.make(
                topology,
                request.options,
                request.normalize,
                (event) => Queue.offer(events, event).pipe(Effect.asVoid),
                resolutionInputs,
                options.mode,
                (error) =>
                  Schema.is(CompilationInputs.RestartRequired)(error.cause)
                    ? Effect.void
                    : Queue.fail(events, error).pipe(Effect.asVoid),
              ).pipe(
                Effect.provide(services),
                Effect.provideService(Scope.Scope, scope),
                Effect.tapError(() => Scope.close(scope, Exit.void)),
              );
              const entry = { ...created, scope };
              yield* Effect.forEach(
                Array.filter(
                  current,
                  (context) => !Array.contains(retained, context),
                ),
                (context) => Scope.close(context.scope, Exit.void),
              );
              yield* Ref.set(contexts, Array.append(retained, entry));
              return entry;
            }).pipe(Effect.uninterruptible);
            const prepared = yield* Effect.serviceOption(PreparedRevisions);
            const expected = Option.flatMap(prepared, (receipts) =>
              Array.findFirst(
                receipts,
                (receipt) => receipt.context === selected.id,
              ),
            );
            const outcome = yield* selected
              .consume(Option.getOrUndefined(expected))
              .pipe(Effect.provide(services), Effect.result);
            yield* resolutionInputs.check;
            if (Result.isSuccess(outcome)) {
              const current = yield* Ref.get(contexts);
              const retained = CompilationState.retain(current, selected);
              yield* Effect.forEach(
                Array.filter(
                  current,
                  (context) =>
                    context !== selected && !Array.contains(retained, context),
                ),
                (context) => Scope.close(context.scope, Exit.void),
              );
              yield* Ref.set(contexts, Array.append(retained, selected));
            }
            return yield* Effect.fromResult(outcome);
          },
          Effect.mapError((cause) =>
            Schema.is(BundlerError)(cause) ||
            Schema.is(CompilationState.Failed)(cause)
              ? cause
              : new BundlerError({ cause }),
          ),
          (effect) => lock.withPermit(effect),
        ),
      });
    }),
  );

export const withPreparedRevisions = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const compiler = yield* Service;
    const receipts = yield* compiler.preparedRevisions;
    return yield* effect.pipe(
      Effect.provideService(PreparedRevisions, receipts),
    );
  });

export const fail = (root: string) => (error: CompilationState.Failed) =>
  Effect.gen(function* () {
    const canonical = yield* canonicalPath(root);
    const attempts = yield* Effect.serviceOption(FailedAttempts);
    if (Option.isSome(attempts))
      yield* Ref.update(attempts.value, (current) =>
        CompilationState.consume(current, error.receipt, [canonical]),
      );
    return yield* new BundlerError({ cause: error.cause });
  });

export const runJob = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const receipts = yield* Ref.make<ReadonlyArray<CompilationState.Receipt>>(
      [],
    );
    const failedReceipts = yield* Ref.make<
      ReadonlyArray<CompilationState.Receipt>
    >([]);
    const exit = yield* Effect.exit(
      Effect.provideService(effect, CompiledModule.Consumption, {
        record: (receipt) =>
          Ref.update(receipts, (current) =>
            CompilationState.consume(current, receipt, receipt.roots),
          ),
      }).pipe(Effect.provideService(FailedAttempts, failedReceipts)),
    );
    return {
      exit,
      receipts: yield* Ref.get(receipts),
      failedReceipts: yield* Ref.get(failedReceipts),
    };
  });
