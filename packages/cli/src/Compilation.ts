import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
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

class FailedAttempts extends Context.Service<
  FailedAttempts,
  Ref.Ref<ReadonlyArray<CompilationState.Receipt>>
>()("@confect/cli/Compilation/FailedAttempts") {}

export interface Request {
  readonly roots: ReadonlyArray<string>;
  readonly profile: CompilationState.Profile;
  readonly options: esbuild.BuildOptions;
  readonly normalize: (metafile: esbuild.Metafile) => esbuild.Metafile;
}

export class Service extends Context.Service<
  Service,
  {
    readonly ownedDirectories: ReadonlyArray<string>;
    readonly authoredFiles: ReadonlyArray<string>;
    readonly events: Stream.Stream<CompilationState.Revision>;
    readonly compile: (
      request: Request,
    ) => Effect.Effect<
      CompilationContext.Snapshot,
      BundlerError | CompilationState.Failed,
      Scope.Scope
    >;
    readonly reset: Effect.Effect<void>;
    readonly topology: Effect.Effect<ReadonlyArray<CompilationState.Topology>>;
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
  readonly ownedDirectories: ReadonlyArray<string>;
  readonly authoredFiles?: ReadonlyArray<string>;
}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const owner = yield* Scope.Scope;
      const services = Context.make(
        FileSystem.FileSystem,
        yield* FileSystem.FileSystem,
      ).pipe(Context.add(Path.Path, yield* Path.Path));
      const events = yield* Queue.unbounded<CompilationState.Revision>();
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
        events: Stream.fromQueue(events),
        reset,
        topology: Ref.get(contexts).pipe(
          Effect.map((current) =>
            Array.map(current, ({ id, profile, roots }) => ({
              id,
              profile,
              roots,
            })),
          ),
        ),
        compile: Effect.fn("Compilation.compile")(
          function* (request) {
            const selected = yield* Effect.gen(function* () {
              const current = yield* Ref.get(contexts);
              const existing = Array.findFirst(current, (context) =>
                CompilationState.compatible(
                  context,
                  request.profile,
                  request.roots,
                ),
              );
              if (Option.isSome(existing)) return existing.value;
              const topology = {
                id: yield* Ref.updateAndGet(nextId, (id) => id + 1),
                profile: request.profile,
                roots: request.roots,
              };
              const retained = CompilationState.retain(current, topology);
              const scope = yield* Scope.fork(owner, "sequential");
              const created = yield* CompilationContext.make(
                topology,
                request.options,
                request.normalize,
                (event) => Queue.offer(events, event).pipe(Effect.asVoid),
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
            return yield* selected.consume().pipe(Effect.provide(services));
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
