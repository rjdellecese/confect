import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Hex from "effect/encoding/Hex";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { pathToFileURL } from "node:url";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Scope from "effect/Scope";
import * as Array from "effect/Array";
import * as Record from "effect/Record";
import * as Option from "effect/Option";
import * as esbuild from "esbuild";
import { BundlerError } from "./BuildError";
import * as CompilationState from "./CompilationState";
import type * as CompilationInputs from "./CompilationInputs";

export interface Snapshot {
  readonly receipt: CompilationState.Receipt;
  readonly metafile: esbuild.Metafile;
  readonly warnings: ReadonlyArray<esbuild.Message>;
}

interface Captured {
  readonly receipt: CompilationState.Receipt;
  readonly metafile: esbuild.Metafile | undefined;
  readonly values: CompilationState.Values;
  readonly outputFiles: ReadonlyArray<esbuild.OutputFile> | undefined;
  readonly warnings: ReadonlyArray<esbuild.Message>;
}

export class IncompleteCompilation extends Schema.TaggedError<IncompleteCompilation>()(
  "IncompleteCompilation",
  {
    context: Schema.Finite,
    reason: Schema.Literals([
      "MissingMetafile",
      "MissingOutputFiles",
      "MissingRevision",
    ]),
  },
) {
  override get message() {
    switch (this.reason) {
      case "MissingMetafile":
        return "esbuild completed without metafile";
      case "MissingOutputFiles":
        return "esbuild completed without output files";
      case "MissingRevision":
        return "esbuild completed without a captured compilation revision";
    }
  }
}

export const relocateMetafile = (
  metafile: esbuild.Metafile,
  from: string,
  to: string,
  path: Path.Path,
): esbuild.Metafile => ({
  inputs: metafile.inputs,
  outputs: Record.fromEntries(
    Array.map(Record.toEntries(metafile.outputs), ([file, metadata]) => [
      path.join(to, path.relative(from, file)),
      {
        ...metadata,
        imports: Array.map(metadata.imports, (imported) =>
          imported.external
            ? imported
            : {
                ...imported,
                path: path.join(to, path.relative(from, imported.path)),
              },
        ),
      },
    ]),
  ),
});

export const make = Effect.fn("CompilationContext.make")(function* (
  topology: CompilationState.Topology,
  options: esbuild.BuildOptions,
  normalize: (metafile: esbuild.Metafile) => esbuild.Metafile,
  publish: (revision: CompilationState.Revision) => Effect.Effect<void>,
  guards: Readonly<
    Record<
      "check" | "ensure",
      Effect.Effect<void, BundlerError | CompilationInputs.RestartRequired>
    >
  > = {
    check: Effect.void,
    ensure: Effect.void,
  },
) {
  const fs = yield* FileSystem.FileSystem;
  const crypto = yield* Crypto.Crypto;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped({
    prefix: "confect-context-",
  });
  const output = path.join(directory, "output");
  const latest = path.join(directory, "latest");
  const lock = yield* Semaphore.make(1);
  const revision = yield* Ref.make(0);
  const latestRevision = yield* Ref.make(0);
  const values = yield* Ref.make<CompilationState.Values>({});
  const latestHashes = yield* Ref.make<CompilationState.Values>({});
  const snapshots = new WeakMap<
    Scope.Scope,
    ReadonlyArray<{
      readonly directory: string;
      readonly values: CompilationState.Values;
    }>
  >();
  const identities = new WeakMap<object, Captured>();
  const prepared = yield* Ref.make(Option.none<Captured>());
  const failures = new WeakMap<object, CompilationState.Receipt>();
  const capture = Effect.fn("CompilationContext.capture")(
    function* (result: esbuild.BuildResult) {
      yield* guards.ensure;
      const number = yield* Ref.updateAndGet(revision, (value) => value + 1);
      yield* Ref.set(prepared, Option.none());
      const receipt = {
        context: topology.id,
        revision: number,
        roots: topology.roots,
      };
      const metafile = result.metafile ? normalize(result.metafile) : undefined;
      if (result.errors.length === 0 && (!metafile || !result.outputFiles)) {
        yield* guards.check;
        return yield* new IncompleteCompilation({
          context: topology.id,
          reason: metafile ? "MissingOutputFiles" : "MissingMetafile",
        });
      }
      for (const error of result.errors) failures.set(error, receipt);
      const hashes = Record.fromEntries(
        yield* Effect.forEach(result.outputFiles ?? [], (file) =>
          crypto
            .digest("SHA-256", file.contents)
            .pipe(Effect.map((hash) => [file.path, Hex.encode(hash)] as const)),
        ),
      );
      if (result.outputFiles && result.errors.length === 0) {
        if (
          !CompilationState.sameValues(yield* Ref.get(latestHashes), hashes)
        ) {
          yield* fs.remove(latest, { recursive: true, force: true });
          yield* fs.makeDirectory(latest, { recursive: true });
          yield* Effect.forEach(result.outputFiles, (file) => {
            const target = path.join(latest, path.relative(output, file.path));
            return fs
              .makeDirectory(path.dirname(target), { recursive: true })
              .pipe(Effect.andThen(fs.writeFile(target, file.contents)));
          });
          yield* Ref.set(latestHashes, hashes);
        }
        yield* Ref.set(latestRevision, number);
      }
      const previous = yield* Ref.get(values);
      const next = yield* Effect.gen(function* () {
        if (!metafile || !result.outputFiles || result.errors.length > 0) {
          const errors = Array.map(
            result.errors,
            ({ id, pluginName, text, location, notes }) => ({
              id,
              pluginName,
              text,
              location,
              notes,
            }),
          );
          const failed = Hex.encode(
            yield* crypto.digest(
              "SHA-256",
              new TextEncoder().encode(
                yield* Schema.encodeEffect(
                  Schema.fromJsonString(Schema.Unknown),
                )(errors),
              ),
            ),
          );
          return Record.fromEntries(
            Array.map(topology.roots, (root) => [root, failed]),
          );
        }
        const inputHashes = Record.fromEntries(
          yield* Effect.forEach(
            Record.toEntries(metafile.inputs),
            ([file, metadata]) =>
              crypto
                .digest(
                  "SHA-256",
                  new TextEncoder().encode(JSON.stringify(metadata)),
                )
                .pipe(Effect.map((hash) => [file, Hex.encode(hash)] as const)),
          ),
        );
        const entries = Array.getSomes(
          Array.map(Record.toEntries(metafile.outputs), ([file, metadata]) =>
            metadata.entryPoint
              ? Option.some([metadata.entryPoint, file] as const)
              : Option.none(),
          ),
        );
        return Record.fromEntries(
          yield* Effect.forEach(entries, ([root, file]) => {
            const contents = CompilationState.fingerprintInput(
              metafile,
              { inputs: inputHashes, outputs: hashes },
              root,
              file,
            );
            return crypto
              .digest("SHA-256", new TextEncoder().encode(contents))
              .pipe(Effect.map((hash) => [root, Hex.encode(hash)] as const));
          }),
        );
      });
      const captured = {
        receipt,
        metafile,
        values: next,
        outputFiles: result.outputFiles,
        warnings: result.warnings,
      };
      identities.set(result, captured);
      yield* Ref.set(values, next);
      yield* guards.check;
      if (result.errors.length === 0)
        yield* Ref.set(prepared, Option.some(captured));
      yield* publish({
        ...receipt,
        roots: topology.roots,
        affectedRoots: CompilationState.changedRoots(
          previous,
          next,
          topology.roots,
        ),
        errors: result.errors,
        warnings: result.warnings,
      });
    },
    (effect) => lock.withPermit(effect),
  );
  const native = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        esbuild.context({
          ...options,
          outdir: output,
          sourceRoot: pathToFileURL(`${output}${path.sep}`).href,
          write: false,
          metafile: true,
          plugins: [
            ...(options.plugins ?? []),
            {
              name: "confect:revision",
              setup(build) {
                build.onEnd((result) =>
                  Effect.runPromiseWith(Context.empty())(capture(result)),
                );
              },
            },
          ],
        }),
      catch: (cause) => new BundlerError({ cause }),
    }),
    (context) => Effect.promise(() => context.dispose()),
  );
  yield* Effect.tryPromise({
    try: () => native.watch(),
    catch: (cause) => new BundlerError({ cause }),
  });
  const rebuild = Effect.fn("CompilationContext.rebuild")(function* () {
    yield* guards.ensure;
    const outcome = yield* Effect.tryPromise({
      try: () => native.rebuild(),
      catch: (cause) => new BundlerError({ cause }),
    }).pipe(Effect.result);
    yield* guards.ensure;
    if (Result.isFailure(outcome)) {
      const cause = outcome.failure.cause;
      if (
        typeof cause !== "object" ||
        cause === null ||
        !("errors" in cause) ||
        !globalThis.Array.isArray(cause.errors)
      )
        return yield* outcome.failure;
      const receipt = Array.head(
        Array.getSomes(
          Array.map(cause.errors, (item: unknown) =>
            typeof item === "object" && item !== null
              ? Option.fromUndefinedOr(failures.get(item))
              : Option.none(),
          ),
        ),
      );
      return yield* Option.isSome(receipt)
        ? new CompilationState.Failed({ cause, receipt: receipt.value })
        : outcome.failure;
    }
    return outcome.success;
  });
  return {
    ...topology,
    preparedRevision: Ref.get(prepared).pipe(
      Effect.map(Option.map((captured) => captured.receipt)),
    ),
    verify: rebuild().pipe(
      Effect.catchTag("CompilationFailed", () => Effect.void),
      Effect.asVoid,
    ),
    consume: Effect.fn("CompilationContext.consume")(
      function* (expected?: CompilationState.Receipt) {
        const available = expected
          ? yield* guards.check.pipe(Effect.andThen(Ref.get(prepared)))
          : Option.none<Captured>();
        const captured =
          expected &&
          Option.isSome(available) &&
          available.value.receipt.context === expected.context &&
          available.value.receipt.revision === expected.revision
            ? available.value
            : identities.get(yield* rebuild());
        if (!captured?.metafile || !captured.outputFiles) {
          return yield* new BundlerError({
            cause: new IncompleteCompilation({
              reason: "MissingRevision",
              context: topology.id,
            }),
          });
        }
        const { receipt, metafile } = captured;
        const scope = yield* Scope.Scope;
        const previous = snapshots.get(scope) ?? [];
        const existing = Array.findFirst(previous, (snapshot) =>
          CompilationState.sameValues(snapshot.values, captured.values),
        );
        if (Option.isSome(existing))
          return {
            receipt,
            metafile: relocateMetafile(
              metafile,
              output,
              existing.value.directory,
              path,
            ),
            warnings: captured.warnings,
          } satisfies Snapshot;
        const target = yield* fs.makeTempDirectoryScoped({
          directory: options.absWorkingDir,
          prefix: ".confect-artifacts-",
        });
        const files = captured.outputFiles;
        yield* lock.withPermit(
          Effect.gen(function* () {
            if ((yield* Ref.get(latestRevision)) === receipt.revision) {
              yield* fs.copy(latest, target, { overwrite: true });
            } else {
              yield* Effect.forEach(files, (file) => {
                const destination = path.join(
                  target,
                  path.relative(output, file.path),
                );
                return fs
                  .makeDirectory(path.dirname(destination), { recursive: true })
                  .pipe(
                    Effect.andThen(fs.writeFile(destination, file.contents)),
                  );
              });
            }
          }),
        );
        if (!snapshots.has(scope))
          yield* Scope.addFinalizer(
            scope,
            Effect.sync(() => {
              snapshots.delete(scope);
            }),
          );
        snapshots.set(
          scope,
          Array.append(previous, {
            directory: target,
            values: captured.values,
          }),
        );
        return {
          receipt,
          metafile: relocateMetafile(metafile, output, target, path),
          warnings: captured.warnings,
        } satisfies Snapshot;
      },
      (effect, _expected?: CompilationState.Receipt) =>
        Effect.mapError(effect, (cause) =>
          Schema.is(BundlerError)(cause) ||
          Schema.is(CompilationState.Failed)(cause)
            ? cause
            : new BundlerError({ cause }),
        ),
    ),
  };
}, Effect.provide(NodeCrypto.layer));

export type CompilationContext = Effect.Success<ReturnType<typeof make>>;
