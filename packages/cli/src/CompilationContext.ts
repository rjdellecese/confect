import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Hex from "effect/encoding/Hex";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { pathToFileURL } from "node:url";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
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
import * as CompilationSources from "./CompilationSources";
import * as CompilationPlugin from "./CompilationPlugin";

export interface Snapshot {
  readonly receipt: CompilationState.Receipt;
  readonly cwd: string;
  readonly metafile: esbuild.Metafile;
  readonly warnings: ReadonlyArray<esbuild.Message>;
}

interface Captured {
  readonly receipt: CompilationState.Receipt;
  readonly metafile: esbuild.Metafile | undefined;
  readonly artifacts: string;
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

export class UnstableInputs extends Schema.TaggedError<UnstableInputs>()(
  "CompilationInputsDidNotStabilize",
  { context: Schema.Finite, attempts: Schema.Finite },
) {
  override get message() {
    return `Compilation inputs kept expanding across ${this.attempts} builds`;
  }
}

export class NativeOperationFailed extends Schema.TaggedError<NativeOperationFailed>()(
  "CompilationNativeOperationFailed",
  { context: Schema.Finite, cause: Schema.Unknown },
) {
  override get message() {
    return `esbuild rebuild failed: ${String(this.cause)}`;
  }
}

const diagnostic = (cause: unknown): esbuild.Message => ({
  id: "confect:compilation-operation",
  pluginName: "confect:revision",
  text: String(cause),
  location: null,
  notes: [],
  detail: cause,
});

export class MissingArtifact extends Schema.TaggedError<MissingArtifact>()(
  "CompilationArtifactMissing",
  { kind: Schema.Literals(["EntryPoint", "Output"]), path: Schema.String },
) {
  override get message() {
    return `esbuild did not capture ${this.kind === "EntryPoint" ? "an output for entry" : "output"}: ${this.path}`;
  }
}

export const selectArtifacts = (
  metafile: esbuild.Metafile,
  outputFiles: ReadonlyArray<esbuild.OutputFile>,
  roots: ReadonlyArray<string>,
  path: Path.Path,
  cwd: string,
) => {
  const remaining = new Set(roots);
  const pending: string[] = [];
  const metadataByPath = new Map(
    Object.entries(metafile.outputs).map(([file, metadata]) => [
      path.resolve(cwd, file),
      metadata,
    ]),
  );
  for (const [file, metadata] of metadataByPath) {
    const entryPoint =
      metadata.entryPoint &&
      path.resolve(cwd, CompilationPlugin.physicalPath(metadata.entryPoint));
    if (entryPoint && remaining.has(entryPoint)) {
      pending.push(file);
      remaining.delete(entryPoint);
    }
  }
  for (const root of remaining)
    return Result.fail(new MissingArtifact({ kind: "EntryPoint", path: root }));
  const available = new Map(outputFiles.map((file) => [file.path, file]));
  const visited = new Set(pending);
  const outputs: esbuild.Metafile["outputs"] = {};
  const files: esbuild.OutputFile[] = [];
  for (let index = 0; index < pending.length; index++) {
    const file = pending[index];
    if (file === undefined) continue;
    const metadata = metadataByPath.get(file);
    const bytes = available.get(file);
    if (!metadata || !bytes)
      return Result.fail(new MissingArtifact({ kind: "Output", path: file }));
    const cssBundle =
      metadata.cssBundle && path.resolve(cwd, metadata.cssBundle);
    outputs[file] = {
      ...metadata,
      imports: metadata.imports.map((imported) =>
        imported.external
          ? imported
          : { ...imported, path: path.resolve(cwd, imported.path) },
      ),
      ...(cssBundle ? { cssBundle } : {}),
    };
    files.push(bytes);
    const dependencies = metadata.imports
      .filter((imported) => !imported.external)
      .map((imported) => path.resolve(cwd, imported.path));
    if (cssBundle) dependencies.push(cssBundle);
    if (available.has(`${file}.map`)) dependencies.push(`${file}.map`);
    for (const dependency of dependencies) {
      if (visited.has(dependency)) continue;
      visited.add(dependency);
      pending.push(dependency);
    }
  }
  return Result.succeed({
    metafile: { inputs: metafile.inputs, outputs },
    files,
  });
};

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
        ...(metadata.cssBundle
          ? {
              cssBundle: path.join(to, path.relative(from, metadata.cssBundle)),
            }
          : {}),
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
  options: Omit<esbuild.BuildOptions, "tsconfig" | "tsconfigRaw"> & {
    readonly tsconfigRaw: esbuild.TsconfigRaw;
  },
  normalize: (metafile: esbuild.Metafile) => esbuild.Metafile,
  publish: (revision: CompilationState.Revision) => Effect.Effect<void>,
  guards: Readonly<
    Record<
      "check" | "ensure",
      Effect.Effect<void, BundlerError | CompilationInputs.RestartRequired>
    >
  > & {
    readonly trackSource?: CompilationInputs.Inputs["trackSource"];
    readonly generation?: Effect.Effect<number>;
  } = {
    check: Effect.void,
    ensure: Effect.void,
  },
  mode: CompilationState.Mode = "Watch",
  publishFailure: (error: BundlerError) => Effect.Effect<void> = () =>
    Effect.void,
  configurationWarnings: ReadonlyArray<esbuild.PartialMessage> = [],
) {
  const fs = yield* FileSystem.FileSystem;
  const crypto = yield* Crypto.Crypto;
  const path = yield* Path.Path;
  const cwd = path.resolve(options.absWorkingDir ?? ".");
  const directory = yield* fs.makeTempDirectoryScoped({
    prefix: "confect-context-",
  });
  const output = path.join(directory, "output");
  const lock = yield* Semaphore.make(1);
  const rebuildLock = yield* Semaphore.make(1);
  const stabilization = yield* Queue.sliding<void>(1);
  const needsStabilization = yield* Ref.make(false);
  const terminalFailure = yield* Ref.make(Option.none<BundlerError>());
  const ensureActive = Effect.gen(function* () {
    const failure = yield* Ref.get(terminalFailure);
    if (Option.isSome(failure)) return yield* failure.value;
  });
  const revision = yield* Ref.make(0);
  const values = yield* Ref.make<CompilationState.Values>({});
  const failed = yield* Ref.make(false);
  const startedGeneration = yield* Ref.make(0);
  const provisional = new WeakSet<object>();
  const sources = yield* CompilationSources.make(options, guards.trackSource);
  const snapshots = new WeakMap<
    Scope.Scope,
    ReadonlyArray<{
      readonly directory: string;
      readonly artifacts: string;
      readonly files: ReadonlySet<string>;
    }>
  >();
  const identities = new WeakMap<object, Captured>();
  const prepared = yield* Ref.make(Option.none<Captured>());
  const failures = new WeakMap<object, CompilationState.Receipt>();
  const failedCaptures = new WeakMap<object, CompilationState.Failed>();
  const failureValues = (errors: ReadonlyArray<esbuild.Message>) =>
    Effect.gen(function* () {
      const hash = Hex.encode(
        yield* crypto.digest(
          "SHA-256",
          new TextEncoder().encode(
            CompilationState.fingerprintFailure(
              Array.map(
                errors,
                ({ id, pluginName, text, location, notes }) => ({
                  id,
                  pluginName,
                  text,
                  location,
                  notes,
                }),
              ),
              yield* sources.captured,
            ),
          ),
        ),
      );
      return Record.fromEntries(
        Array.map(topology.roots, (root) => [root, hash]),
      );
    });
  const observeFailure = (cause: unknown) =>
    lock.withPermit(
      Effect.gen(function* () {
        yield* guards.check;
        yield* sources.ensure;
        yield* Ref.set(prepared, Option.none());
        yield* Ref.set(failed, true);
        yield* Ref.set(needsStabilization, false);
        const receipt = {
          context: topology.id,
          revision: yield* Ref.updateAndGet(revision, (current) => current + 1),
          roots: topology.roots,
        };
        const errors = [diagnostic(cause)];
        const next = yield* failureValues(errors);
        const previous = yield* Ref.getAndSet(values, next);
        yield* publish({
          ...receipt,
          errors,
          warnings: [],
          affectedRoots: CompilationState.changedRoots(
            previous,
            next,
            topology.roots,
          ),
        });
        return new CompilationState.Failed({ cause, receipt });
      }),
    );
  const capture = Effect.fn("CompilationContext.capture")(
    function* (result: esbuild.BuildResult) {
      yield* Ref.set(prepared, Option.none());
      yield* ensureActive;
      yield* guards.ensure;
      yield* sources.ensure;
      if (
        (yield* guards.generation ?? Effect.succeed(0)) !==
        (yield* Ref.get(startedGeneration))
      ) {
        provisional.add(result);
        for (const error of result.errors) provisional.add(error);
        yield* guards.check;
        yield* Ref.set(needsStabilization, true);
        if (mode === "Watch") yield* Queue.offer(stabilization, undefined);
        return;
      }
      const number = yield* Ref.updateAndGet(revision, (value) => value + 1);
      yield* Ref.set(failed, true);
      const receipt = {
        context: topology.id,
        revision: number,
        roots: topology.roots,
      };
      const metafile = result.metafile ? normalize(result.metafile) : undefined;
      const incomplete =
        result.errors.length === 0 && (!metafile || !result.outputFiles)
          ? new IncompleteCompilation({
              context: topology.id,
              reason: metafile ? "MissingOutputFiles" : "MissingMetafile",
            })
          : undefined;
      const errors = incomplete ? [diagnostic(incomplete)] : result.errors;
      if (incomplete)
        failedCaptures.set(
          result,
          new CompilationState.Failed({ cause: incomplete, receipt }),
        );
      for (const error of errors) failures.set(error, receipt);
      const hashes = Record.fromEntries(
        yield* Effect.forEach(result.outputFiles ?? [], (file) =>
          crypto
            .digest("SHA-256", file.contents)
            .pipe(Effect.map((hash) => [file.path, Hex.encode(hash)] as const)),
        ),
      );
      const previous = yield* Ref.get(values);
      const next = yield* Effect.gen(function* () {
        if (!metafile || !result.outputFiles || errors.length > 0)
          return yield* failureValues(errors);
        const raw = result.metafile;
        if (!raw)
          return yield* new IncompleteCompilation({
            context: topology.id,
            reason: "MissingMetafile",
          });
        const observations = yield* sources.inputs(raw);
        const inputHashes = Record.mapEntries(raw.inputs, (metadata, file) => [
          Record.keys(
            normalize({ inputs: { [file]: metadata }, outputs: {} }).inputs,
          )[0] ?? file,
          observations[file] ?? "",
        ]);
        const immutable = Array.flatMap(Record.values(raw.inputs), (metadata) =>
          Array.map(
            Array.filter(
              metadata.imports,
              (imported) =>
                !imported.external &&
                imported.original?.startsWith("data:") === true,
            ),
            (imported) => imported.path,
          ),
        );
        const generated = Record.keys(
          normalize({
            inputs: Record.filter(
              raw.inputs,
              (_, file) =>
                file.startsWith(`${CompilationPlugin.namespace}:`) ||
                Array.contains(immutable, file),
            ),
            outputs: {},
          }).inputs,
        );
        const fingerprint = CompilationState.makeInputFingerprinter(
          metafile,
          inputHashes,
          generated,
        );
        return Record.fromEntries(
          yield* Effect.forEach(topology.roots, (root) =>
            Effect.gen(function* () {
              const input = metafile.inputs[root]
                ? Option.some(root)
                : Array.findFirst(
                    Record.keys(metafile.inputs),
                    (file) =>
                      path.resolve(
                        options.absWorkingDir ?? ".",
                        CompilationPlugin.physicalPath(file),
                      ) === root,
                  );
              if (Option.isNone(input))
                return yield* new CompilationSources.Unobserved({
                  paths: [root],
                });
              const contents = fingerprint(input.value);
              return yield* crypto
                .digest("SHA-256", new TextEncoder().encode(contents))
                .pipe(Effect.map((hash) => [root, Hex.encode(hash)] as const));
            }),
          ),
        );
      });
      const captured = {
        receipt,
        metafile,
        artifacts: CompilationState.fingerprintArtifacts(hashes),
        outputFiles: result.outputFiles,
        warnings: result.warnings,
      };
      yield* guards.check;
      identities.set(result, captured);
      yield* Ref.set(values, next);
      if (errors.length === 0) yield* Ref.set(prepared, Option.some(captured));
      yield* Ref.set(failed, errors.length > 0);
      yield* Ref.set(needsStabilization, false);
      yield* publish({
        ...receipt,
        roots: topology.roots,
        affectedRoots: CompilationState.changedRoots(
          previous,
          next,
          topology.roots,
        ),
        errors,
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
          tsconfigRaw: options.tsconfigRaw,
          outdir: output,
          sourceRoot: pathToFileURL(`${output}${path.sep}`).href,
          write: false,
          metafile: true,
          plugins: [
            ...sources.plugins,
            {
              name: "confect:revision",
              setup(build) {
                build.onStart(() =>
                  Effect.runPromiseWith(Context.empty())(
                    Effect.gen(function* () {
                      yield* Ref.set(
                        startedGeneration,
                        yield* guards.generation ?? Effect.succeed(0),
                      );
                      return {
                        warnings: Array.fromIterable(configurationWarnings),
                      };
                    }),
                  ),
                );
                build.onEnd((result) =>
                  Effect.runPromiseWith(Context.empty())(
                    capture(result).pipe(
                      Effect.tapError((cause) =>
                        Effect.gen(function* () {
                          const failure = Schema.is(BundlerError)(cause)
                            ? cause
                            : new BundlerError({ cause });
                          yield* Ref.set(terminalFailure, Option.some(failure));
                          yield* publishFailure(failure);
                        }),
                      ),
                    ),
                  ),
                );
              },
            },
          ],
        }),
      catch: (cause) => new BundlerError({ cause }),
    }),
    (context) => Effect.promise(() => context.dispose()),
  );
  const runBuild = Effect.fn("CompilationContext.rebuild")(function* () {
    for (let attempt = 0; attempt < 8; attempt++) {
      yield* ensureActive;
      yield* guards.ensure;
      yield* sources.ensure.pipe(
        Effect.mapError((cause) => new BundlerError({ cause })),
      );
      const outcome = yield* Effect.tryPromise({
        try: () => native.rebuild(),
        catch: (cause) => new BundlerError({ cause }),
      }).pipe(Effect.result);
      yield* ensureActive;
      yield* guards.ensure;
      yield* sources.ensure.pipe(
        Effect.mapError((cause) => new BundlerError({ cause })),
      );
      if (Result.isFailure(outcome)) {
        const cause = outcome.failure.cause;
        if (
          typeof cause !== "object" ||
          cause === null ||
          !("errors" in cause) ||
          !globalThis.Array.isArray(cause.errors)
        ) {
          const failure = yield* observeFailure(
            new NativeOperationFailed({ context: topology.id, cause }),
          );
          return yield* failure;
        }
        if (
          Array.some(
            cause.errors,
            (item: unknown) =>
              typeof item === "object" &&
              item !== null &&
              provisional.has(item),
          )
        )
          continue;
        const receipt = Array.head(
          Array.getSomes(
            Array.map(cause.errors, (item: unknown) =>
              typeof item === "object" && item !== null
                ? Option.fromUndefinedOr(failures.get(item))
                : Option.none(),
            ),
          ),
        );
        if (Option.isSome(receipt))
          return yield* new CompilationState.Failed({
            cause,
            receipt: receipt.value,
          });
        const failure = yield* observeFailure(
          new NativeOperationFailed({ context: topology.id, cause }),
        );
        return yield* failure;
      }
      if (provisional.has(outcome.success)) continue;
      const capturedFailure = failedCaptures.get(outcome.success);
      if (capturedFailure) return yield* capturedFailure;
      if (
        !outcome.success.metafile ||
        !outcome.success.outputFiles ||
        !identities.has(outcome.success)
      ) {
        const failure = yield* observeFailure(
          new IncompleteCompilation({
            context: topology.id,
            reason: !outcome.success.metafile
              ? "MissingMetafile"
              : !outcome.success.outputFiles
                ? "MissingOutputFiles"
                : "MissingRevision",
          }),
        );
        return yield* failure;
      }
      return outcome.success;
    }
    return yield* new BundlerError({
      cause: new UnstableInputs({ context: topology.id, attempts: 8 }),
    });
  });
  const rebuild = () => rebuildLock.withPermit(runBuild());
  if (mode === "Watch") {
    yield* Stream.fromQueue(stabilization).pipe(
      Stream.runForEach(() =>
        rebuildLock.withPermit(
          Effect.gen(function* () {
            if (!(yield* Ref.get(needsStabilization))) return;
            yield* runBuild().pipe(
              Effect.catchTag("CompilationFailed", () => Effect.void),
            );
          }),
        ),
      ),
      Effect.catch((cause) =>
        Effect.gen(function* () {
          const failure = Schema.is(BundlerError)(cause)
            ? cause
            : new BundlerError({ cause });
          yield* Ref.set(terminalFailure, Option.some(failure));
          yield* Ref.set(prepared, Option.none());
          yield* publishFailure(failure);
        }),
      ),
      Effect.forkScoped,
    );
    yield* Effect.tryPromise({
      try: () => native.watch(),
      catch: (cause) => new BundlerError({ cause }),
    });
  }
  return {
    ...topology,
    failed: Ref.get(failed),
    preparedRevision: Ref.get(prepared).pipe(
      Effect.map(Option.map((captured) => captured.receipt)),
    ),
    verify: rebuild().pipe(
      Effect.catchTag("CompilationFailed", () => Effect.void),
      Effect.asVoid,
    ),
    consume: Effect.fn("CompilationContext.consume")(
      function* (
        expected?: CompilationState.Receipt,
        roots: ReadonlyArray<string> = topology.roots,
      ) {
        yield* ensureActive;
        yield* sources.ensure;
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
        const { receipt } = captured;
        const { metafile, files } = yield* Effect.fromResult(
          selectArtifacts(
            captured.metafile,
            captured.outputFiles,
            roots,
            path,
            cwd,
          ),
        );
        const scope = yield* Scope.Scope;
        const directoryCandidate =
          snapshots
            .get(scope)
            ?.find((snapshot) => snapshot.artifacts === captured.artifacts)
            ?.directory ??
          (yield* fs.makeTempDirectoryScoped({
            directory: options.absWorkingDir,
            prefix: ".confect-artifacts-",
          }));
        const target = yield* lock.withPermit(
          Effect.gen(function* () {
            const previous = snapshots.get(scope) ?? [];
            const existing = previous.find(
              (snapshot) => snapshot.artifacts === captured.artifacts,
            );
            const snapshotDirectory = existing?.directory ?? directoryCandidate;
            const written = new Set(existing?.files);
            const directories = new Set([snapshotDirectory]);
            for (const file of files) {
              if (written.has(file.path)) continue;
              const destination = path.join(
                snapshotDirectory,
                path.relative(output, file.path),
              );
              const parent = path.dirname(destination);
              if (!directories.has(parent)) {
                yield* fs.makeDirectory(parent, { recursive: true });
                directories.add(parent);
              }
              yield* fs.writeFile(destination, file.contents);
              written.add(file.path);
            }
            if (!snapshots.has(scope))
              yield* Scope.addFinalizer(
                scope,
                Effect.sync(() => {
                  snapshots.delete(scope);
                }),
              );
            const snapshot = {
              directory: snapshotDirectory,
              artifacts: captured.artifacts,
              files: written,
            };
            snapshots.set(
              scope,
              existing
                ? previous.map((value) =>
                    value === existing ? snapshot : value,
                  )
                : [...previous, snapshot],
            );
            return snapshotDirectory;
          }),
        );
        yield* sources.ensure;
        yield* ensureActive;
        return {
          receipt,
          cwd,
          metafile: relocateMetafile(metafile, output, target, path),
          warnings: captured.warnings,
        } satisfies Snapshot;
      },
      (
        effect,
        _expected?: CompilationState.Receipt,
        _roots?: ReadonlyArray<string>,
      ) =>
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
