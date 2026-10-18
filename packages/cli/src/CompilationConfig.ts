import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { parseTree, type Node, type ParseError } from "jsonc-parser";
import Module from "node:module";

export class DiscoveryFailed extends Schema.TaggedError<DiscoveryFailed>()(
  "CompilationConfigDiscoveryFailed",
  { path: Schema.String, cause: Schema.Unknown },
) {}

export class DiscoveryRejected extends Schema.TaggedError<DiscoveryRejected>()(
  "CompilationConfigDiscoveryRejected",
  { path: Schema.String, reason: Schema.String },
) {}

type Failure = DiscoveryFailed | DiscoveryRejected;
export type CandidateKind = "File" | "Directory" | "Missing";

export interface RuntimeObservation {
  readonly path: string;
  readonly value: object;
  readonly current: Effect.Effect<object | undefined, Failure>;
}

export interface Discovery {
  readonly configuration: string | undefined;
  readonly files: ReadonlyArray<string>;
}

const property = (node: Node | undefined, key: string): Node | undefined =>
  node?.type === "object"
    ? node.children?.find((entry) => entry.children?.[0]?.value === key)
        ?.children?.[1]
    : undefined;

const string = (node: Node | undefined): string | undefined =>
  node?.type === "string" && typeof node.value === "string"
    ? node.value
    : undefined;

const parse = (file: string, contents: string, manifest: boolean) => {
  const errors: ParseError[] = [];
  const tree = parseTree(contents, errors, {
    allowTrailingComma: !manifest,
    disallowComments: manifest,
  });
  return errors.length || !tree
    ? Result.fail(new DiscoveryFailed({ path: file, cause: errors }))
    : Result.succeed(tree);
};

const parents = (path: Path.Path, directory: string): ReadonlyArray<string> => {
  const result: string[] = [];
  for (let current = directory; ; current = path.dirname(current)) {
    result.push(current);
    if (path.dirname(current) === current) return result;
  }
};

const packagePath = (value: string) =>
  !/^(?:\.{1,2}(?:[\\/]|$)|[\\/])/.test(value);

const exportTarget = (
  file: string,
  exports: Node,
  subpath: string,
  conditions: ReadonlyArray<string>,
  pnp = false,
): Result.Result<string | undefined, DiscoveryRejected> => {
  const reject = (reason: string) =>
    Result.fail(new DiscoveryRejected({ path: file, reason }));
  let target: Node | undefined = exports;
  let substitution: string | undefined;
  if (exports.type === "object") {
    const entries = exports.children ?? [];
    const keys = entries.map((entry) => string(entry.children?.[0]) ?? "");
    if (keys.some((key) => key.startsWith("."))) {
      if (keys.some((key) => !key.startsWith(".")))
        return Result.succeed(undefined);
      target =
        subpath.endsWith("/") || subpath.includes("*")
          ? undefined
          : property(exports, subpath);
      if (!target) {
        const patterns = keys
          .filter((key) => key.includes("*") || key.endsWith("/"))
          .sort((a, b) => {
            const prefix = (key: string) =>
              key.includes("*") ? key.indexOf("*") : key.length;
            return (
              prefix(b) - prefix(a) ||
              Number(b.includes("*")) - Number(a.includes("*")) ||
              b.length - a.length
            );
          });
        for (const key of patterns) {
          const star = key.indexOf("*");
          if (star < 0) {
            if (subpath.startsWith(key))
              return pnp
                ? reject("PnpDirectoryExport")
                : Result.succeed(undefined);
            continue;
          }
          const prefix = key.slice(0, star);
          const suffix = key.slice(star + 1);
          if (
            subpath.startsWith(prefix) &&
            subpath.endsWith(suffix) &&
            (!suffix || subpath.length >= key.length)
          ) {
            substitution = subpath.slice(
              prefix.length,
              subpath.length - suffix.length,
            );
            target = property(exports, key);
            break;
          }
        }
      }
    } else if (subpath !== ".") target = undefined;
  } else if (subpath !== ".") target = undefined;

  const select = (
    node: Node | undefined,
  ): Result.Result<string | null | undefined, DiscoveryRejected> => {
    if (!node) return Result.succeed(undefined);
    if (node.type === "null") return Result.succeed(null);
    const value = string(node);
    if (value !== undefined) {
      if (!value.startsWith("./")) return Result.succeed(null);
      if (
        value
          .slice(2)
          .split(/[\\/]/)
          .some((part) => [".", "..", "node_modules"].includes(part))
      )
        return Result.succeed(null);
      const normalized = `./${value.slice(2).split("/").filter(Boolean).join("/")}`;
      const resolved =
        substitution === undefined
          ? normalized
          : normalized.replaceAll("*", substitution);
      if (
        resolved
          .slice(2)
          .split("/")
          .some((part) => [".", "..", "node_modules"].includes(part))
      )
        return reject("InvalidPackageExportSubpath");
      return Result.succeed(resolved);
    }
    if (node.type === "array") {
      let fallback: null | undefined = node.children?.length ? undefined : null;
      for (const child of node.children ?? []) {
        const selected = select(child);
        if (Result.isFailure(selected)) return selected;
        if (selected.success != null) return selected;
        if (selected.success === null) fallback = null;
      }
      return Result.succeed(fallback);
    }
    if (node.type === "object") {
      const keys = (node.children ?? []).map(
        (entry) => string(entry.children?.[0]) ?? "",
      );
      if (
        keys.some((key) => key.startsWith(".")) &&
        keys.some((key) => !key.startsWith("."))
      )
        return Result.succeed(null);
      for (const entry of node.children ?? []) {
        const key = string(entry.children?.[0]);
        if (
          key === "default" ||
          (key !== undefined && conditions.includes(key))
        ) {
          const selected = select(entry.children?.[1]);
          if (Result.isFailure(selected) || selected.success !== undefined)
            return selected;
        }
      }
      return Result.succeed(undefined);
    }
    return Result.succeed(null);
  };
  return Result.flatMap(select(target), (value) => {
    if (value == null || /%(?:2f|5c)|%(?![\da-f]{2})/i.test(value))
      return Result.succeed(undefined);
    let decoded: string;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      return reject("NonUtf8PackageExportTarget");
    }
    if (decoded.endsWith("/") || decoded.endsWith("\\"))
      return Result.succeed(undefined);
    if (decoded.includes("\0")) return reject("NullBytePackageExportTarget");
    return Result.succeed(decoded);
  });
};

export const discover = <E = never, R = never>(
  sourceFile: string,
  observe: (
    file: string,
    kind: CandidateKind,
  ) => Effect.Effect<void, E, R> = () => Effect.void,
  conditions: ReadonlyArray<string> = ["node", "module"],
  observeRuntime: (
    observation: RuntimeObservation,
  ) => Effect.Effect<void, E, R> = () => Effect.void,
): Effect.Effect<
  Discovery,
  Failure | E,
  FileSystem.FileSystem | Path.Path | R
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const discovered = new Set<string>();
    const visited = new Set<string>();
    const pnpFiles = new Set<string>();
    const reject = (file: string, reason: string) =>
      new DiscoveryRejected({ path: file, reason });
    const validate = Effect.fn("CompilationConfig.validate")(function* (
      file: string,
    ) {
      if (path.basename(file) === ".env.local")
        return yield* reject(file, "ForbiddenFile");
      const found = yield* Effect.gen(function* () {
        const real = yield* fs.realPath(file);
        if (path.basename(real) === ".env.local")
          return yield* reject(file, "ForbiddenFile");
        const info = yield* fs.stat(real);
        if (info.type !== "File" && info.type !== "Directory")
          return yield* reject(file, "NotRegularFile");
        return { real, kind: info.type };
      }).pipe(
        Effect.catch((error) => {
          if (
            error._tag === "PlatformError" &&
            (error.reason._tag === "NotFound" ||
              (error.reason._tag === "BadResource" &&
                typeof error.reason.cause === "object" &&
                error.reason.cause !== null &&
                "code" in error.reason.cause &&
                error.reason.cause.code === "ENOTDIR"))
          )
            return Effect.succeed({ real: file, kind: "Missing" as const });
          return Effect.fail(
            error._tag === "CompilationConfigDiscoveryRejected"
              ? error
              : new DiscoveryFailed({ path: file, cause: error }),
          );
        }),
      );
      return found;
    });
    const inspect = Effect.fn("CompilationConfig.inspect")(function* (
      file: string,
    ) {
      const found = yield* validate(file);
      discovered.add(file);
      yield* observe(file, found.kind);
      return yield* validate(file);
    });
    const read = Effect.fn("CompilationConfig.read")(function* (
      file: string,
      manifest = false,
    ) {
      const found = yield* inspect(file);
      if (found.kind !== "File") return undefined;
      if (found.real !== file) {
        yield* inspect(found.real);
      }
      const guarded = yield* validate(file);
      if (guarded.kind !== "File") return undefined;
      if (guarded.real !== found.real)
        return yield* reject(file, "ChangedDuringDiscovery");
      const contents = yield* fs
        .readFileString(guarded.real)
        .pipe(
          Effect.mapError(
            (cause) => new DiscoveryFailed({ path: file, cause }),
          ),
        );
      return {
        real: guarded.real,
        tree: yield* Effect.fromResult(parse(file, contents, manifest)),
      };
    });
    const acquirePnp = (
      issuer: string,
    ): Effect.Effect<object | undefined, Failure> =>
      Effect.gen(function* () {
        for (const file of pnpFiles) yield* validate(file);
        const api: unknown = yield* Effect.try({
          try: (): unknown =>
            "findPnpApi" in Module && typeof Module.findPnpApi === "function"
              ? Module.findPnpApi(issuer)
              : undefined,
          catch: (cause) => new DiscoveryFailed({ path: issuer, cause }),
        });
        for (const file of pnpFiles) yield* validate(file);
        if (api === null || api === undefined) return undefined;
        if (typeof api !== "object")
          return yield* reject(issuer, "InvalidPnpApi");
        return api;
      });
    const resolvePnp = Effect.fn("CompilationConfig.resolvePnp")(function* (
      api: object,
      request: string,
      issuer: string | null,
    ) {
      if (
        !("resolveToUnqualified" in api) ||
        typeof api.resolveToUnqualified !== "function"
      )
        return yield* reject(issuer ?? request, "InvalidPnpApi");
      const resolve = api.resolveToUnqualified;
      const resolved: unknown = yield* Effect.try({
        try: (): unknown =>
          resolve.call(api, request, issuer, { considerBuiltins: false }),
        catch: (cause) =>
          new DiscoveryFailed({ path: issuer ?? request, cause }),
      }).pipe(
        Effect.catchIf(
          (error) =>
            typeof error.cause === "object" &&
            error.cause !== null &&
            "code" in error.cause &&
            error.cause.code === "MODULE_NOT_FOUND",
          () => Effect.void,
        ),
      );
      if (resolved === undefined || resolved === null) return undefined;
      if (typeof resolved !== "string" || !path.isAbsolute(resolved))
        return yield* reject(issuer ?? request, "InvalidPnpResolution");
      for (const ancestor of parents(path, resolved)) {
        if (path.basename(ancestor).endsWith(".zip")) {
          pnpFiles.add(ancestor);
          yield* inspect(ancestor);
        }
      }
      return resolved;
    });
    const visit = (file: string): Effect.Effect<boolean, Failure | E, R> =>
      Effect.gen(function* () {
        const config = yield* read(file);
        if (!config) return false;
        if (visited.has(config.real)) return true;
        visited.add(config.real);
        const extension = property(config.tree, "extends");
        const values =
          extension?.type === "array"
            ? (extension.children ?? [])
            : [extension];
        for (const item of values) {
          const value = string(item);
          if (value !== undefined)
            yield* extend(path.dirname(config.real), value);
        }
        return true;
      });
    const extend = (
      directory: string,
      value: string,
    ): Effect.Effect<void, Failure | E, R> =>
      Effect.gen(function* () {
        if (!packagePath(value) || path.isAbsolute(value)) {
          const file = path.resolve(
            directory,
            value === "." || value === ".." ? `${value}/tsconfig.json` : value,
          );
          if (!(yield* visit(file)) && !file.endsWith(".json"))
            yield* visit(`${file}.json`);
          return;
        }
        if (!value)
          return yield* reject(directory, "UnsupportedPackageSpecifier");
        const parts = value.split("/");
        const count = value.startsWith("@") ? 2 : 1;
        const packageName =
          value.startsWith("@") && parts.length < 2
            ? ""
            : parts.slice(0, count).join("/");
        const subpath =
          !packageName ||
          packageName.startsWith(".") ||
          /[\\%]/.test(packageName)
            ? ""
            : parts.length > count
              ? `./${parts.slice(count).join("/")}`
              : ".";
        let pnpPath: string | undefined;
        for (const current of new Set([
          ...parents(path, directory),
          ...parents(path, path.dirname(path.resolve(sourceFile))),
        ])) {
          for (const name of [
            ".pnp.data.json",
            ".pnp.cjs",
            ".pnp.js",
            ".pnp.loader.mjs",
          ]) {
            const file = path.join(current, name);
            pnpFiles.add(file);
            if (
              (yield* inspect(file)).kind === "File" &&
              name !== ".pnp.loader.mjs"
            )
              pnpPath ??= file;
          }
        }
        const issuer = path.join(directory, "tsconfig.json");
        const currentApi = acquirePnp(issuer);
        const api = yield* currentApi;
        if (api !== undefined) {
          const apiPath = yield* resolvePnp(api, "pnpapi", null);
          if (!apiPath) return yield* reject(issuer, "InvalidPnpApi");
          pnpFiles.add(apiPath);
          yield* inspect(apiPath);
          yield* observeRuntime({
            path: apiPath,
            value: api,
            current: currentApi,
          });
          if (!packageName)
            return yield* reject(issuer, "UnsupportedPackageSpecifier");
          const packageDirectory = yield* resolvePnp(api, packageName, issuer);
          const unqualified = yield* resolvePnp(api, value, issuer);
          if (!packageDirectory || !unqualified) return;
          const manifestFile = path.join(packageDirectory, "package.json");
          const manifest = yield* read(manifestFile, true);
          const exports = property(manifest?.tree, "exports");
          if (exports && exports.type !== "null") {
            const target = yield* Effect.fromResult(
              exportTarget(
                manifestFile,
                exports,
                subpath,
                ["node", "import", ...conditions],
                true,
              ),
            );
            if (target) yield* visit(path.join(packageDirectory, target));
            return;
          }
          if (!(yield* visit(unqualified)) && !unqualified.endsWith(".json"))
            yield* visit(`${unqualified}.json`);
          return;
        }
        if (
          pnpPath &&
          !("findPnpApi" in Module && typeof Module.findPnpApi === "function")
        )
          return yield* reject(pnpPath, "PnpRuntimeUnavailable");
        for (const current of parents(path, directory)) {
          if (path.basename(current) === "node_modules") continue;
          const packageDirectory = path.join(
            current,
            "node_modules",
            packageName,
          );
          const manifestFile = path.join(packageDirectory, "package.json");
          const manifest = yield* read(manifestFile, true);
          let base = path.join(current, "node_modules", value);
          if (manifest) {
            const config = string(property(manifest.tree, "tsconfig"));
            if (config) base = path.resolve(packageDirectory, config);
            const exports = property(manifest.tree, "exports");
            if (exports) {
              const target = yield* Effect.fromResult(
                exportTarget(manifestFile, exports, subpath, [
                  "node",
                  "require",
                  ...conditions,
                ]),
              );
              if (target && (yield* visit(path.join(packageDirectory, target))))
                return;
            }
          }
          for (const file of [
            path.join(base, "tsconfig.json"),
            base,
            `${base}.json`,
          ]) {
            if (yield* visit(file)) return;
          }
        }
      });
    for (const directory of parents(
      path,
      path.dirname(path.resolve(sourceFile)),
    )) {
      if (directory === path.parse(directory).root) break;
      const configuration = path.join(directory, "tsconfig.json");
      const candidate = yield* inspect(configuration);
      if (candidate.kind === "Missing") continue;
      if (candidate.kind !== "File")
        return yield* reject(configuration, "NotRegularFile");
      yield* visit(configuration);
      return { configuration, files: [...discovered] };
    }
    return { configuration: undefined, files: [...discovered] };
  }).pipe(Effect.withSpan("CompilationConfig.discover"));
