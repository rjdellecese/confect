import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { createRequire, isBuiltin } from "node:module";
import { pathToFileURL } from "node:url";
import type {
  Compiler,
  ExternalItem,
  ExternalItemFunctionData,
  Module,
} from "@rspack/core";
import * as Context from "effect/Context";
import * as Cache from "effect/Cache";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Hex from "effect/encoding/Hex";
import { resolveModulePath } from "exsolve";
import * as CompilationInputs from "../../../packages/cli/src/CompilationInputs.ts";

export class Failed extends Schema.TaggedError<Failed>()(
  "RspackExternalsFailed",
  { importer: Schema.String, request: Schema.String, cause: Schema.Unknown },
) {}

export class Unsupported extends Schema.TaggedError<Unsupported>()(
  "RspackExternalsUnsupported",
  { path: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `${this.reason}: ${this.path}`;
  }
}

export interface Observation {
  readonly importer: string;
  readonly request: string;
  readonly dependencyType: string;
  readonly physical: string;
  readonly emitted: string;
  readonly sha256: string;
}

const requireTarget = Option.liftThrowable(
  (request: string, importer: string) =>
    createRequire(importer).resolve(request),
);

const importTarget = Option.liftThrowable(
  (request: string, importer: string, conditions: ReadonlyArray<string>) =>
    resolveModulePath(request, {
      from: importer,
      conditions: ["import", ...conditions],
      cache: false,
    }),
);

const requireResolveFailure = (
  block: Pick<Module, "dependencies" | "blocks">,
  file: string,
): Unsupported | undefined => {
  for (const dependency of block.dependencies) {
    if (
      dependency.type === "require.resolve" ||
      dependency.type === "require.resolve context"
    )
      return new Unsupported({ path: file, reason: "RequireResolve" });
  }
  for (const child of block.blocks) {
    const failure = requireResolveFailure(child, file);
    if (failure) return failure;
  }
};

export const make = Effect.fn("RspackExternals.make")(
  function* (options: {
    readonly inputs: CompilationInputs.Inputs;
    readonly conditions: ReadonlyArray<string>;
  }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const { inputs, conditions } = options;
    const observations = yield* Ref.make<ReadonlyArray<Observation>>([]);
    let sealed = false;
    let runtimeResolution = false;
    let pending = 0;
    let captureFailure: Unsupported | undefined;

    const pnpDirectories = yield* Cache.make({
      capacity: 4096,
      lookup: Effect.fn("RspackExternals.checkPnpDirectory")(function* (
        directory: string,
      ) {
        const candidates = CompilationInputs.ancestors(path, directory).flatMap(
          (ancestor) =>
            [".pnp.cjs", ".pnp.js", ".pnp.loader.mjs", ".pnp.data.json"].map(
              (name) => path.join(ancestor, name),
            ),
        );
        for (const candidate of candidates) {
          if (yield* fs.exists(candidate))
            return yield* new Unsupported({
              path: candidate,
              reason: "PnpProject",
            });
        }
        yield* inputs.track(candidates);
        for (const candidate of candidates) {
          if (yield* fs.exists(candidate))
            return yield* new Unsupported({
              path: candidate,
              reason: "PnpProject",
            });
        }
        yield* inputs.checkFiles(candidates);
      }),
    });
    const rejectPnp = Effect.fn("RspackExternals.rejectPnp")(function* (
      importer: string,
    ) {
      if ("pnp" in process.versions)
        return yield* new Unsupported({ path: importer, reason: "ActivePnp" });
      yield* Cache.get(pnpDirectories, path.dirname(importer));
    });
    const packageCandidates = yield* Cache.make({
      capacity: 4096,
      lookup: Effect.fn("RspackExternals.discoverPackage")(function* (
        key: string,
      ) {
        const [directory, name] = key.split("\0");
        const candidates = CompilationInputs.ancestors(path, directory).map(
          (ancestor) =>
            path.join(ancestor, "node_modules", name, "package.json"),
        );
        yield* inputs.track(candidates);
        return candidates;
      }),
    });

    const resolve = Effect.fn("RspackExternals.resolve")(function* (
      data: ExternalItemFunctionData,
    ) {
      const request = data.request;
      const importer = data.contextInfo?.issuer;
      if (!request || !importer) return;
      if (sealed)
        return yield* new Unsupported({ path: importer, reason: "Sealed" });
      yield* inputs.ensure;
      yield* rejectPnp(importer);
      const required = data.dependencyType === "commonjs";
      if (isBuiltin(request))
        return `${required ? "node-commonjs" : "module-import"} ${request}`;
      if (!data.getResolve || !data.context)
        return yield* new Unsupported({
          path: importer,
          reason: "MissingNativeResolver",
        });
      yield* inputs.trackSource(importer);
      const bare =
        !request.startsWith(".") &&
        !request.startsWith("#") &&
        !path.isAbsolute(request);
      const name = request
        .split("/")
        .slice(0, request.startsWith("@") ? 2 : 1)
        .join("/");
      const candidates = bare
        ? yield* Cache.get(
            packageCandidates,
            `${path.dirname(importer)}\0${name}`,
          )
        : [];
      const nativeResolve = data.getResolve();
      const context = data.context;
      const native = yield* Effect.tryPromise({
        try: () => nativeResolve(context, request),
        catch: (cause) => new Failed({ importer, request, cause }),
      }).pipe(Effect.option);
      const resolved = Option.getOrUndefined(native);
      if (resolved && !/[\\/]node_modules[\\/]/.test(resolved)) return;
      if (
        resolved &&
        (request.startsWith(".") || path.isAbsolute(request)) &&
        !/[\\/]node_modules[\\/]/.test(request)
      )
        return;
      if (!resolved && !bare) return;
      yield* inputs.checkFiles(candidates);
      runtimeResolution = true;
      const requiredPath = requireTarget(request, importer);
      const importedPath = importTarget(request, importer, conditions);
      if (!resolved && (!bare || Option.isNone(requiredPath))) return;
      if (Option.isNone(requiredPath) && Option.isNone(importedPath)) return;
      const physical = Option.getOrElse(
        required || !resolved ? requiredPath : importedPath,
        () => resolved,
      );
      if (!physical) return;
      const emitted = required
        ? physical
        : resolved && Option.isSome(importedPath)
          ? pathToFileURL(importedPath.value).href
          : request;
      yield* rejectPnp(physical);
      yield* inputs.trackSource(physical);
      yield* inputs.track([physical]);
      const canonical = yield* fs.realPath(physical);
      if (
        path.basename(canonical) === ".env.local" ||
        path.basename(physical) === ".env.local"
      )
        return yield* new Unsupported({
          path: physical,
          reason: "ForbiddenFile",
        });
      const bytes = yield* fs.readFile(canonical);
      const sha256 = Hex.encode(yield* crypto.digest("SHA-256", bytes));
      yield* inputs.checkFiles([...candidates, physical]);
      if (sealed)
        return yield* new Unsupported({ path: importer, reason: "Sealed" });
      yield* Ref.update(observations, (current) => [
        ...current,
        {
          importer,
          request,
          dependencyType: data.dependencyType ?? "unknown",
          physical,
          emitted,
          sha256,
        },
      ]);
      return `${required ? "node-commonjs" : "module-import"} ${emitted}`;
    });

    const externals: ExternalItem = (data) =>
      Effect.runPromiseWith(Context.empty())(
        Effect.suspend(() => {
          pending++;
          return resolve(data).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                pending--;
              }),
            ),
          );
        }),
      );
    const capture = Effect.gen(function* () {
      sealed = true;
      if (pending > 0)
        captureFailure ??= new Unsupported({
          path: "",
          reason: "PendingResolutions",
        });
      if (captureFailure) return yield* captureFailure;
      yield* inputs.check;
      const completed = yield* Ref.get(observations);
      return {
        observations: completed,
        validate: inputs.check,
        reusable: !runtimeResolution,
      };
    });
    const check = Effect.fn("RspackExternals.check")(function* (entry: string) {
      yield* rejectPnp(entry);
      yield* inputs.ensure;
    });
    const plugin = (compiler: Compiler) => {
      compiler.hooks.compilation.tap(
        "confect:external-runtime-policy",
        (compilation) => {
          compilation.hooks.finishModules.tap(
            "confect:external-runtime-policy",
            (modules) => {
              for (const module of modules) {
                const failure = requireResolveFailure(
                  module,
                  module.nameForCondition() ?? module.identifier(),
                );
                if (failure) throw failure;
              }
            },
          );
        },
      );
    };
    return { externals, plugin, capture, check };
  },
  (effect) => Effect.provide(effect, NodeCrypto.layer),
);
