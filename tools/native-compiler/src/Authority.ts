import { AsyncLocalStorage } from "node:async_hooks";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as esbuild from "esbuild";
import * as CompilationInputs from "../../../packages/cli/src/CompilationInputs";
import * as CompilationPlugin from "../../../packages/cli/src/CompilationPlugin";
import type * as Protocol from "./Protocol";

export class AuthorityRejected extends Schema.TaggedError<AuthorityRejected>()(
  "NativeAuthorityRejected",
  { operation: Schema.String, reason: Schema.String, cause: Schema.Unknown },
) {}

const diagnostic = (message: esbuild.PartialMessage): Protocol.Diagnostic => ({
  id: message.id ?? "",
  pluginName: message.pluginName ?? "",
  text: message.text ?? "",
  location: message.location
    ? {
        file: message.location.file ?? "",
        namespace: message.location.namespace ?? "",
        line: message.location.line ?? 0,
        column: message.location.column ?? 0,
        length: message.location.length ?? 0,
        lineText: message.location.lineText ?? "",
        suggestion: message.location.suggestion ?? "",
      }
    : null,
  notes: (message.notes ?? []).map((note) => ({
    text: note.text ?? "",
    location: note.location
      ? {
          file: note.location.file ?? "",
          namespace: note.location.namespace ?? "",
          line: note.location.line ?? 0,
          column: note.location.column ?? 0,
          length: note.location.length ?? 0,
          lineText: note.location.lineText ?? "",
          suggestion: note.location.suggestion ?? "",
        }
      : null,
  })),
});

const toMessage = (message: Protocol.Diagnostic): esbuild.Message => ({
  id: message.id,
  pluginName: message.pluginName,
  text: message.text,
  location: message.location,
  notes: message.notes.map((note) => ({
    text: note.text,
    location: note.location,
  })),
  detail: undefined,
});

export const make = Effect.fn("NativeAuthority.make")(function* (options: {
  readonly root: string;
  readonly entries: ReadonlyArray<string>;
  readonly outdir: string;
  readonly conditions: ReadonlyArray<string>;
  readonly ownedDirectories: ReadonlyArray<string>;
  readonly authoredFiles: ReadonlyArray<string>;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const inputs = yield* CompilationInputs.make("Once", options.conditions);
  const configurations = yield* Effect.forEach(options.entries, (entry) =>
    inputs.configuration(entry),
  );
  const raw = configurations[0]?.tsconfigRaw ?? {};
  const encodeConfiguration = Schema.encodeEffect(
    Schema.fromJsonString(Schema.Unknown),
  );
  const tsconfigRaw = yield* encodeConfiguration(raw);
  const encodedConfigurations = yield* Effect.forEach(
    configurations,
    (configuration) => encodeConfiguration(configuration.tsconfigRaw),
  );
  if (
    encodedConfigurations.some((configuration) => configuration !== tsconfigRaw)
  )
    return yield* new AuthorityRejected({
      operation: "create",
      reason: "EntriesRequireSeparateConfigurationPartitions",
      cause: options.entries,
    });
  const resolver = yield* CompilationPlugin.make(
    path,
    fs,
    options.ownedDirectories,
    options.authoredFiles,
    options.conditions,
    inputs,
    options.entries,
  );
  const starts: Array<Parameters<esbuild.PluginBuild["onStart"]>[0]> = [];
  const resolves: Array<Parameters<esbuild.PluginBuild["onResolve"]>[1]> = [];
  const probe = new AsyncLocalStorage<Protocol.Resolve>();
  const initialOptions: esbuild.BuildOptions = {};
  yield* Effect.tryPromise({
    try: () =>
      Promise.resolve(
        resolver.plugin.setup({
          initialOptions,
          esbuild,
          onStart: (callback) => {
            starts.push(callback);
          },
          onResolve: (_filter, callback) => {
            resolves.push(callback);
          },
          onLoad: () => {},
          onEnd: () => {},
          onDispose: () => {},
          resolve: (specifier, resolveOptions) => {
            const request = probe.getStore();
            if (
              !request ||
              !resolveOptions ||
              specifier !== request.args.path ||
              resolveOptions.importer !== request.args.importer ||
              resolveOptions.resolveDir !== request.args.resolveDir ||
              resolveOptions.kind !== request.args.kind ||
              resolveOptions.pluginData !== CompilationPlugin.nativeProbe
            )
              return Promise.reject(
                new AuthorityRejected({
                  operation: "probe",
                  reason: "UnsupportedAdditionalProbe",
                  cause: { specifier, importer: resolveOptions?.importer },
                }),
              );
            return Promise.resolve({
              ...request.probe,
              errors: request.probe.errors.map(toMessage),
              warnings: request.probe.warnings.map(toMessage),
              pluginData: undefined,
            });
          },
        }),
      ),
    catch: (cause) =>
      new AuthorityRejected({
        operation: "setup",
        reason: "PluginSetupFailed",
        cause,
      }),
  });
  if (
    resolves.length !== 1 ||
    starts.length !== 1 ||
    initialOptions.define?.__dirname !== "__injected_dirname__" ||
    initialOptions.define?.__filename !== "__injected_filename__" ||
    initialOptions.define?.["import.meta.url"] !==
      "__injected_import_meta_url__"
  )
    return yield* new AuthorityRejected({
      operation: "setup",
      reason: "ProductionPluginContractChanged",
      cause: initialOptions,
    });
  let started:
    | { readonly epoch: number; readonly generation: number }
    | undefined;
  return {
    options: {
      root: options.root,
      entries: options.entries,
      outdir: options.outdir,
      conditions: options.conditions,
      tsconfigRaw,
    } satisfies Protocol.CreateOptions,
    begin: Effect.fn("NativeAuthority.begin")(function* (epoch: number) {
      yield* Effect.tryPromise({
        try: () => Promise.all(starts.map((start) => Promise.resolve(start()))),
        catch: (cause) =>
          new AuthorityRejected({
            operation: "begin",
            reason: "GuardFailed",
            cause,
          }),
      });
      started = { epoch, generation: yield* inputs.generation };
    }),
    resolve: Effect.fn("NativeAuthority.resolve")(function* (
      request: Protocol.Resolve,
    ) {
      if (!started || request.epoch !== started.epoch)
        return yield* new AuthorityRejected({
          operation: "resolve",
          reason: "EpochMismatch",
          cause: request.epoch,
        });
      const callback = resolves[0];
      const result = yield* Effect.tryPromise({
        try: () =>
          probe.run(request, () =>
            Promise.resolve(
              callback({ ...request.args, pluginData: undefined }),
            ),
          ),
        catch: (cause) =>
          new AuthorityRejected({
            operation: "resolve",
            reason: "ResolutionFailed",
            cause,
          }),
      });
      if (!result) return { mode: "probe" } satisfies Protocol.Decision;
      if (result.pluginData !== undefined)
        return yield* new AuthorityRejected({
          operation: "resolve",
          reason: "UnsupportedPluginData",
          cause: request.args.path,
        });
      return {
        mode: "result",
        result: {
          path: result.path ?? "",
          namespace: result.namespace ?? "",
          suffix: result.suffix ?? "",
          external: result.external ?? false,
          sideEffects: result.sideEffects ?? true,
          errors: (result.errors ?? []).map(diagnostic),
          warnings: (result.warnings ?? []).map(diagnostic),
          watchFiles: result.watchFiles ?? [],
          watchDirs: result.watchDirs ?? [],
        },
      } satisfies Protocol.Decision;
    }, Effect.uninterruptible),
    check: Effect.fn("NativeAuthority.check")(function* (
      capture: Protocol.Capture,
    ) {
      if (!started || capture.epoch !== started.epoch)
        return yield* new AuthorityRejected({
          operation: "capture",
          reason: "EpochMismatch",
          cause: capture.epoch,
        });
      for (const source of capture.sources)
        if (
          source.namespace === "file" ||
          source.namespace === CompilationPlugin.namespace
        )
          yield* inputs.trackSource(source.path);
      yield* inputs.check;
      const generation = yield* inputs.generation;
      if (started.generation !== generation)
        return yield* new AuthorityRejected({
          operation: "capture",
          reason: "ProvisionalGeneration",
          cause: { started: started.generation, generation },
        });
    }),
    normalize: resolver.normalize,
  };
});
