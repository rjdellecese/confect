import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  getNodeValue,
  parseTree,
  type Node,
  type ParseError,
} from "jsonc-parser";
import Module from "node:module";
import type * as esbuild from "esbuild";

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
  readonly tsconfigRaw: esbuild.TsconfigRaw;
  readonly warnings: ReadonlyArray<esbuild.PartialMessage>;
  readonly files: ReadonlyArray<string>;
}

export interface ReadObservation {
  readonly path: string;
  readonly realPath: string;
  readonly contents: Uint8Array;
}

interface Resolved {
  readonly options: Readonly<Record<string, unknown>>;
  readonly pathsOrigin:
    | { readonly directory: string; readonly file: string }
    | undefined;
}

const warning = (
  file: string,
  reason: string,
  subject: string,
  text: string,
): esbuild.PartialMessage => ({
  pluginName: "confect:configuration",
  text,
  location: { file, line: 1, column: 0 },
  detail: { _tag: "CompilationConfigDiagnostic", path: file, reason, subject },
});

const compilerOptions = (tree: Node, file: string) => {
  const options = property(tree, "compilerOptions");
  const result: Record<string, unknown> = {};
  const warnings: esbuild.PartialMessage[] = [];
  const invalid = (key: string) =>
    warnings.push(
      warning(
        file,
        "InvalidCompilerOption",
        key,
        `Ignoring invalid compilerOptions.${key}; the inherited value or default is used.`,
      ),
    );
  for (const key of [
    "alwaysStrict",
    "experimentalDecorators",
    "preserveValueImports",
    "strict",
    "useDefineForClassFields",
    "verbatimModuleSyntax",
  ]) {
    const value = property(options, key);
    if (value?.type === "boolean") result[key] = value.value;
    else if (value) invalid(key);
  }
  for (const key of [
    "baseUrl",
    "jsx",
    "jsxFactory",
    "jsxFragmentFactory",
    "jsxImportSource",
    "target",
    "importsNotUsedAsValues",
  ]) {
    const value = string(property(options, key));
    if (value === undefined) {
      if (property(options, key)) invalid(key);
      continue;
    }
    if (
      (key === "target" &&
        !/^(?:es3|es5|es6|es20(?:1[5-9]|2[0-5])|esnext)$/i.test(value)) ||
      (key === "jsx" &&
        ![
          "preserve",
          "react-native",
          "react",
          "react-jsx",
          "react-jsxdev",
        ].includes(value.toLowerCase())) ||
      (key === "importsNotUsedAsValues" &&
        !["remove", "preserve", "error"].includes(value)) ||
      ((key === "jsxFactory" || key === "jsxFragmentFactory") &&
        !/^[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*(?:\.[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*)*$/u.test(
          value,
        ))
    ) {
      invalid(key);
      continue;
    }
    result[key] = value;
  }
  const paths = property(options, "paths");
  if (paths?.type === "object") result.paths = getNodeValue(paths);
  else if (paths) invalid("paths");
  return { options: result, warnings };
};

const substitute = (path: Path.Path, value: string, directory: string) =>
  value.startsWith("${configDir}")
    ? `${directory}${path.sep}${value.slice(12).replace(/^[\\/]+/, "")}`
    : value;

const flatten = (path: Path.Path, resolved: Resolved, directory: string) => {
  const warnings: esbuild.PartialMessage[] = [];
  const paths = resolved.options.paths;
  if (typeof paths !== "object" || paths === null || Array.isArray(paths))
    return { tsconfigRaw: { compilerOptions: resolved.options }, warnings };
  const base =
    typeof resolved.options.baseUrl === "string"
      ? resolved.options.baseUrl
      : (resolved.pathsOrigin?.directory ?? directory);
  const normalized = new Map<string, string[]>();
  const invalid = (subject: string) =>
    warnings.push(
      warning(
        resolved.pathsOrigin?.file ?? path.join(directory, "tsconfig.json"),
        "InvalidPaths",
        subject,
        `Ignoring invalid compilerOptions.paths entry "${subject}". Relative targets require "./" or "../" when baseUrl is absent.`,
      ),
    );
  for (const [key, values] of Object.entries(paths)) {
    if (key.split("*").length > 2 || !Array.isArray(values)) {
      invalid(key);
      continue;
    }
    const targets: string[] = [];
    for (const item of values) {
      if (typeof item !== "string" || item.split("*").length > 2) {
        invalid(key);
        continue;
      }
      const value = substitute(path, item, directory);
      if (
        typeof resolved.options.baseUrl !== "string" &&
        !/^(?:\.{1,2}(?:[\\/]|$)|[\\/]|[a-z]:[\\/])/i.test(value)
      ) {
        invalid(key);
        continue;
      }
      targets.push(
        path.isAbsolute(value) ? value : `${base}${path.sep}${value}`,
      );
    }
    normalized.set(key, targets);
  }
  return {
    tsconfigRaw: {
      compilerOptions: {
        ...resolved.options,
        paths: Object.fromEntries(normalized),
      },
    },
    warnings,
  };
};

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
): Result.Result<
  {
    readonly target: string | undefined;
    readonly warnings: ReadonlyArray<esbuild.PartialMessage>;
  },
  DiscoveryRejected
> => {
  const warnings: esbuild.PartialMessage[] = [];
  const invalid = () =>
    warnings.push(
      warning(
        file,
        "InvalidPackageExports",
        subpath,
        "Ignoring an invalid package exports entry while resolving configuration inheritance.",
      ),
    );
  const reject = (reason: string) =>
    Result.fail(new DiscoveryRejected({ path: file, reason }));
  let target: Node | undefined = exports;
  let substitution: string | undefined;
  if (exports.type === "object") {
    const entries = exports.children ?? [];
    const keys = entries.map((entry) => string(entry.children?.[0]) ?? "");
    if (keys.some((key) => key.startsWith("."))) {
      if (keys.some((key) => !key.startsWith("."))) {
        invalid();
        return Result.succeed({ target: undefined, warnings });
      }
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
                : Result.succeed({ target: undefined, warnings });
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
      ) {
        invalid();
        return Result.succeed(null);
      }
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
    invalid();
    return Result.succeed(null);
  };
  return Result.map(
    Result.flatMap(select(target), (value) => {
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
    }),
    (selected) => ({ target: selected, warnings }),
  );
};

export const discover = <E = never, R = never>(
  sourceFile: string,
  observe: (
    file: string,
    kind: CandidateKind,
    realPath: string,
  ) => Effect.Effect<void, E, R> = () => Effect.void,
  conditions: ReadonlyArray<string> = ["node", "module"],
  observeRuntime: (
    observation: RuntimeObservation,
  ) => Effect.Effect<void, E, R> = () => Effect.void,
  observeRead: (
    observation: ReadObservation,
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
    const resolving = new Set<string>();
    const completed = new Map<string, Resolved>();
    let cyclic = false;
    let configurationDirectory = path.dirname(path.resolve(sourceFile));
    const pnpFiles = new Set<string>();
    const warnings: esbuild.PartialMessage[] = [];
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
      yield* observe(file, found.kind, found.real);
      const confirmed = yield* validate(file);
      if (confirmed.kind !== found.kind || confirmed.real !== found.real)
        return yield* reject(file, "ChangedDuringDiscovery");
      return confirmed;
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
      if (guarded.kind !== "File" || guarded.real !== found.real)
        return yield* reject(file, "ChangedDuringDiscovery");
      const contents = yield* fs
        .readFile(guarded.real)
        .pipe(
          Effect.mapError(
            (cause) => new DiscoveryFailed({ path: file, cause }),
          ),
        );
      yield* observeRead({ path: file, realPath: guarded.real, contents });
      return {
        real: guarded.real,
        tree: yield* Effect.fromResult(
          parse(file, new TextDecoder().decode(contents), manifest),
        ),
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
    const visit = (
      file: string,
    ): Effect.Effect<Resolved | undefined, Failure | E, R> =>
      Effect.gen(function* () {
        const config = yield* read(file);
        if (!config) return undefined;
        if (resolving.has(config.real)) {
          cyclic = true;
          warnings.push(
            warning(
              file,
              "CyclicExtends",
              config.real,
              `Ignoring cyclic configuration inheritance at "${file}".`,
            ),
          );
          return { options: {}, pathsOrigin: undefined };
        }
        const cached = completed.get(config.real);
        if (cached) return cached;
        resolving.add(config.real);
        let inherited: Resolved = { options: {}, pathsOrigin: undefined };
        const extension = property(config.tree, "extends");
        const values =
          extension?.type === "array"
            ? (extension.children ?? [])
            : [extension];
        for (const item of values) {
          const value = string(item);
          if (value !== undefined) {
            const base = yield* extend(path.dirname(config.real), value);
            if (base)
              inherited = {
                options: { ...inherited.options, ...base.options },
                pathsOrigin: base.pathsOrigin ?? inherited.pathsOrigin,
              };
            else
              warnings.push(
                warning(
                  file,
                  "MissingExtends",
                  value,
                  `Cannot find base configuration "${value}".`,
                ),
              );
          }
        }
        const parsed = compilerOptions(config.tree, config.real);
        warnings.push(...parsed.warnings);
        const own = parsed.options;
        const baseUrl =
          typeof own.baseUrl === "string"
            ? path.resolve(
                path.dirname(config.real),
                substitute(path, own.baseUrl, configurationDirectory),
              )
            : undefined;
        const result = {
          options: {
            ...inherited.options,
            ...own,
            ...(baseUrl === undefined ? {} : { baseUrl }),
          },
          pathsOrigin:
            own.paths !== undefined
              ? { directory: path.dirname(config.real), file: config.real }
              : inherited.pathsOrigin,
        };
        resolving.delete(config.real);
        if (!cyclic) completed.set(config.real, result);
        return result;
      });
    const extend = (
      directory: string,
      value: string,
    ): Effect.Effect<Resolved | undefined, Failure | E, R> =>
      Effect.gen(function* () {
        if (!packagePath(value) || path.isAbsolute(value)) {
          const file = path.resolve(
            directory,
            value === "." || value === ".." ? `${value}/tsconfig.json` : value,
          );
          return (
            (yield* visit(file)) ??
            (file.endsWith(".json") ? undefined : yield* visit(`${file}.json`))
          );
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
            yield* inspect(file);
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
            const selection = yield* Effect.fromResult(
              exportTarget(
                manifestFile,
                exports,
                subpath,
                ["node", "import", ...conditions],
                true,
              ),
            );
            warnings.push(...selection.warnings);
            const target = selection.target;
            return target
              ? yield* visit(path.join(packageDirectory, target))
              : undefined;
          }
          return (
            (yield* visit(unqualified)) ??
            (unqualified.endsWith(".json")
              ? undefined
              : yield* visit(`${unqualified}.json`))
          );
        }
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
              const selection = yield* Effect.fromResult(
                exportTarget(manifestFile, exports, subpath, [
                  "node",
                  "require",
                  ...conditions,
                ]),
              );
              warnings.push(...selection.warnings);
              const target = selection.target;
              if (target) {
                const selected = yield* visit(
                  path.join(packageDirectory, target),
                );
                if (selected) return selected;
              }
            }
          }
          for (const file of [
            path.join(base, "tsconfig.json"),
            base,
            `${base}.json`,
          ]) {
            const selected = yield* visit(file);
            if (selected) return selected;
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
      configurationDirectory = directory;
      const selected = yield* visit(configuration);
      const flattened = flatten(
        path,
        selected ?? { options: {}, pathsOrigin: undefined },
        directory,
      );
      return {
        configuration,
        tsconfigRaw: flattened.tsconfigRaw,
        warnings: [...warnings, ...flattened.warnings],
        files: [...discovered],
      };
    }
    return {
      configuration: undefined,
      tsconfigRaw: {},
      warnings,
      files: [...discovered],
    };
  }).pipe(Effect.withSpan("CompilationConfig.discover"));
