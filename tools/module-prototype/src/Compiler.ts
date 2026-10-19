import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as Crypto from "effect/Crypto";
import * as Hex from "effect/encoding/Hex";
import { isBuiltin } from "node:module";
import { pathToFileURL } from "node:url";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as esbuild from "esbuild";
import { moduleRunnerTransform } from "vite";
import * as CompilationInputs from "../../../packages/cli/src/CompilationInputs.ts";
import * as CompilationPlugin from "../../../packages/cli/src/CompilationPlugin.ts";
import * as NodeConditions from "../../../packages/cli/src/NodeConditions.ts";
import type * as Protocol from "./Protocol.ts";

export class Failed extends Schema.TaggedError<Failed>()(
  "PrototypeCompilationFailed",
  {
    stage: Schema.String,
    path: Schema.String,
    cause: Schema.Unknown,
  },
) {
  override get message() {
    return `${this.stage} failed for ${this.path}: ${String(this.cause)}`;
  }
}

export class Rejected extends Schema.TaggedError<Rejected>()(
  "PrototypeModuleRejected",
  {
    path: Schema.String,
    reason: Schema.Literals([
      "ForbiddenFile",
      "NotRegularFile",
      "UnsupportedLoader",
      "UnsupportedNamespace",
      "UnsupportedSuffix",
      "UnresolvedExternal",
      "MissingTransform",
      "UnstableInputs",
    ]),
  },
) {
  override get message() {
    return `${this.reason}: ${this.path}`;
  }
}

export class Changed extends Schema.TaggedError<Changed>()(
  "PrototypeInputsChanged",
  {
    paths: Schema.Array(Schema.String),
  },
) {
  override get message() {
    return `Inputs changed: ${this.paths.join(", ")}`;
  }
}

interface Observation {
  readonly path: string;
  readonly real: string;
  readonly digest: string;
}

interface Transformed {
  readonly identity: string;
  readonly code: string;
  readonly dependencies: ReadonlyArray<string>;
  readonly dynamic: ReadonlyArray<string>;
}

interface Attempt {
  readonly snapshot: Protocol.Snapshot;
  readonly observations: ReadonlyArray<Observation>;
  readonly transforms: Map<string, Transformed>;
}

export const make = Effect.fn("Prototype.Compiler.make")(function* (
  entry: string,
  options: {
    readonly ownedDirectories?: ReadonlyArray<string>;
    readonly authoredFiles?: ReadonlyArray<string>;
  } = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const crypto = yield* Crypto.Crypto;
  const path = yield* Path.Path;
  const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
  const conditions = yield* NodeConditions.current;
  const inputs = yield* CompilationInputs.make("Once", conditions);
  const configuration = yield* inputs.configuration(entry);
  const resolver = yield* CompilationPlugin.make(
    path,
    fs,
    options.ownedDirectories ?? [],
    options.authoredFiles ?? [],
    conditions,
    inputs,
  );
  const cwd = path.dirname(path.resolve(entry));
  const lock = yield* Semaphore.make(1);
  const metrics = { reads: 0, transforms: 0, hits: 0, builds: 0 };
  let cache = new Map<string, Transformed>();
  let captured: Result.Result<Attempt, Failed> | undefined;
  const currentCapture = (): Result.Result<Attempt, Failed> | undefined =>
    captured;
  const read = Effect.fn("Prototype.Compiler.read")(function* (file: string) {
    if (path.basename(file) === ".env.local")
      return yield* new Rejected({ path: file, reason: "ForbiddenFile" });
    const real = yield* fs.realPath(file);
    if (path.basename(real) === ".env.local")
      return yield* new Rejected({ path: file, reason: "ForbiddenFile" });
    if ((yield* fs.stat(real)).type !== "File")
      return yield* new Rejected({ path: file, reason: "NotRegularFile" });
    const bytes = yield* fs.readFile(real);
    metrics.reads++;
    return {
      path: file,
      real,
      bytes,
      digest: Hex.encode(yield* crypto.digest("SHA-256", bytes)),
    };
  });
  const validate = (observations: ReadonlyArray<Observation>) =>
    Effect.gen(function* () {
      yield* inputs.check;
      const changed: string[] = [];
      for (const observation of observations) {
        const current = yield* read(observation.path);
        if (
          current.real !== observation.real ||
          current.digest !== observation.digest
        )
          changed.push(observation.path);
      }
      yield* inputs.check;
      if (changed.length > 0) return yield* new Changed({ paths: changed });
    });
  const graph = (build: esbuild.PluginBuild) =>
    Effect.gen(function* () {
      const pending: { id: string; file: string; namespace: string }[] = [];
      const seen = new Set<string>();
      const modules: Protocol.Module[] = [];
      const externals: Protocol.Snapshot["externals"][number][] = [];
      const observations: Observation[] = [];
      const transforms = new Map<string, Transformed>();
      const resolve = Effect.fn("Prototype.Compiler.resolve")(function* (
        specifier: string,
        importer: string,
        kind: esbuild.ImportKind,
      ) {
        const resolved = yield* Effect.tryPromise({
          try: () =>
            build.resolve(specifier, {
              importer,
              resolveDir: path.dirname(importer),
              kind,
              namespace: "file",
            }),
          catch: (cause) =>
            new Failed({ stage: "Resolve", path: specifier, cause }),
        });
        if (resolved.errors.length > 0)
          return yield* new Failed({
            stage: "Resolve",
            path: specifier,
            cause: resolved.errors,
          });
        if (resolved.suffix)
          return yield* new Rejected({
            path: resolved.path,
            reason: "UnsupportedSuffix",
          });
        const id =
          resolved.namespace && resolved.namespace !== "file"
            ? `${resolved.namespace}:${resolved.path}`
            : resolved.path;
        if (seen.has(id)) return id;
        seen.add(id);
        if (resolved.external) {
          if (
            !isBuiltin(resolved.path) &&
            !resolved.path.startsWith("file:") &&
            !path.isAbsolute(resolved.path)
          )
            return yield* new Rejected({
              path: resolved.path,
              reason: "UnresolvedExternal",
            });
          externals.push({
            id,
            url: path.isAbsolute(resolved.path)
              ? pathToFileURL(resolved.path).href
              : resolved.path,
            type: isBuiltin(resolved.path) ? "builtin" : "module",
          });
        } else {
          if (
            resolved.namespace !== "file" &&
            resolved.namespace !== CompilationPlugin.namespace
          )
            return yield* new Rejected({
              path: resolved.path,
              reason: "UnsupportedNamespace",
            });
          pending.push({
            id,
            file: resolved.path,
            namespace: resolved.namespace,
          });
        }
        return id;
      });
      const root = yield* resolve(
        path.resolve(entry),
        path.resolve(entry),
        "entry-point",
      );
      for (let index = 0; index < pending.length; index++) {
        const item = pending[index];
        const loaded = yield* read(item.file);
        observations.push({
          path: loaded.path,
          real: loaded.real,
          digest: loaded.digest,
        });
        yield* inputs.trackSource(item.file);
        const extension = path.extname(item.file);
        const loader =
          item.namespace === CompilationPlugin.namespace
            ? "text"
            : extension === ".json"
              ? "json"
              : extension === ".tsx"
                ? "tsx"
                : [".ts", ".mts", ".cts"].includes(extension)
                  ? "ts"
                  : extension === ".jsx"
                    ? "jsx"
                    : [".js", ".mjs", ".cjs"].includes(extension)
                      ? "js"
                      : undefined;
        if (!loader)
          return yield* new Rejected({
            path: item.file,
            reason: "UnsupportedLoader",
          });
        const identity = `${loaded.real.length}:${loaded.real}${loader}:${loaded.digest}`;
        let transformed = cache.get(item.id);
        if (transformed?.identity === identity) metrics.hits++;
        else {
          const javascript = yield* Effect.tryPromise({
            try: () =>
              esbuild.transform(loaded.bytes, {
                loader,
                sourcefile: item.file,
                format: "esm",
                platform: "node",
                tsconfigRaw: configuration.tsconfigRaw,
                sourcemap: "inline",
              }),
            catch: (cause) =>
              new Failed({ stage: "Transform", path: item.file, cause }),
          });
          const result = yield* Effect.tryPromise({
            try: () =>
              moduleRunnerTransform(
                javascript.code,
                null,
                item.file,
                javascript.code,
              ),
            catch: (cause) =>
              new Failed({ stage: "RunnerTransform", path: item.file, cause }),
          });
          if (!result)
            return yield* new Rejected({
              path: item.file,
              reason: "MissingTransform",
            });
          transformed = {
            identity,
            code: result.code,
            dependencies: result.deps ?? [],
            dynamic: result.dynamicDeps ?? [],
          };
          metrics.transforms++;
        }
        transforms.set(item.id, transformed);
        const imports = new Map<string, string>();
        for (const specifier of transformed.dependencies)
          imports.set(
            specifier,
            yield* resolve(specifier, item.file, "import-statement"),
          );
        for (const specifier of transformed.dynamic)
          imports.set(
            specifier,
            yield* resolve(specifier, item.file, "dynamic-import"),
          );
        modules.push({
          id: item.id,
          file: item.file,
          code: transformed.code,
          imports: Object.fromEntries(imports),
        });
      }
      return {
        snapshot: { entry: root, modules, externals },
        observations,
        transforms,
      } satisfies Attempt;
    }).pipe(
      Effect.mapError(
        (cause) => new Failed({ stage: "Graph", path: entry, cause }),
      ),
    );
  const native = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        esbuild.context({
          absWorkingDir: cwd,
          entryPoints: ["confect-module-prototype:driver"],
          tsconfigRaw: configuration.tsconfigRaw,
          platform: "node",
          mainFields: ["main"],
          format: "esm",
          bundle: true,
          write: false,
          logLevel: "silent",
          conditions: [...conditions],
          plugins: [
            {
              name: "confect-module-prototype",
              setup(build) {
                build.onResolve(
                  { filter: /^confect-module-prototype:driver$/ },
                  () => ({
                    path: "driver",
                    namespace: "confect-module-prototype",
                  }),
                );
                build.onLoad(
                  { filter: /.*/, namespace: "confect-module-prototype" },
                  () =>
                    Effect.runPromiseWith(services)(
                      graph(build).pipe(
                        Effect.result,
                        Effect.map((result): esbuild.OnLoadResult => {
                          captured = result;
                          return Result.isFailure(result)
                            ? { errors: [{ text: String(result.failure) }] }
                            : { contents: "export {};", loader: "js" };
                        }),
                      ),
                    ),
                );
              },
            },
            resolver.plugin,
          ],
        }),
      catch: (cause) => new Failed({ stage: "Context", path: entry, cause }),
    }),
    (context) => Effect.promise(() => context.dispose()),
  );
  return {
    metrics: Effect.sync(() => ({ ...metrics })),
    compile: lock.withPermit(
      Effect.gen(function* () {
        for (let attempt = 0; attempt < 8; attempt++) {
          yield* inputs.check;
          const generation = yield* inputs.generation;
          captured = undefined;
          metrics.builds++;
          const built = yield* Effect.tryPromise({
            try: () => native.rebuild(),
            catch: (cause) =>
              new Failed({ stage: "Build", path: entry, cause }),
          }).pipe(Effect.result);
          const result = currentCapture();
          if (result && Result.isFailure(result)) return yield* result.failure;
          if (Result.isFailure(built)) return yield* built.failure;
          if (!result || Result.isFailure(result))
            return yield* new Failed({
              stage: "Capture",
              path: entry,
              cause: "No captured module graph",
            });
          if ((yield* inputs.generation) !== generation) continue;
          const validated = yield* validate(result.success.observations).pipe(
            Effect.result,
          );
          if (Result.isFailure(validated)) {
            if (Schema.is(Changed)(validated.failure)) continue;
            return yield* validated.failure;
          }
          cache = result.success.transforms;
          return {
            snapshot: result.success.snapshot,
            validate: validate(result.success.observations),
          };
        }
        return yield* new Rejected({ path: entry, reason: "UnstableInputs" });
      }),
    ),
  };
}, Effect.provide(NodeCrypto.layer));
