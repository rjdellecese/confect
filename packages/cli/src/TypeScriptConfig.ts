import * as NodeModule from "node:module";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HashSet from "effect/HashSet";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import * as RegExp from "effect/RegExp";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import * as Jsonc from "jsonc-parser";
import * as Exsolve from "exsolve";
import type * as esbuild from "esbuild";
import * as BuildError from "./BuildError";

export const TypeScriptConfig = Schema.Struct({
  path: Schema.String,
  aliases: Schema.Array(Schema.String),
});
export type TypeScriptConfig = typeof TypeScriptConfig.Type;

class DiscoveryRejected extends Schema.TaggedError<DiscoveryRejected>()(
  "TypeScriptConfigDiscoveryRejected",
  {
    path: Schema.String,
    reason: Schema.Literals(["ForbiddenFile", "NotRegularFile"]),
  },
) {}

interface InheritedConfig {
  readonly aliases: Option.Option<ReadonlyArray<string>>;
}

interface ConfigSource {
  readonly path: string;
  readonly tree: Jsonc.Node | undefined;
}

const NotDirectory = Schema.Struct({ code: Schema.Literal("ENOTDIR") });

const property = (
  node: Jsonc.Node | undefined,
  key: string,
): Jsonc.Node | undefined =>
  Match.value(node).pipe(
    Match.when({ type: "object" }, (object) =>
      Array.findFirst(
        object.children ?? [],
        (entry) => entry.children?.[0]?.value === key,
      ).pipe(
        Option.flatMap((entry) => Option.fromUndefinedOr(entry.children?.[1])),
        Option.getOrUndefined,
      ),
    ),
    Match.orElse(() => undefined),
  );

const string = (node: Jsonc.Node | undefined): Option.Option<string> =>
  Match.value(node).pipe(
    Match.when({ type: "string" }, (text) =>
      Schema.decodeUnknownOption(Schema.String)(text.value),
    ),
    Match.orElse(() => Option.none()),
  );

const parents = (path: Path.Path, directory: string): ReadonlyArray<string> =>
  Array.unfold(Option.some(path.resolve(directory)), (current) =>
    Option.map(
      current,
      (value) =>
        [
          value,
          path.dirname(value) === value
            ? Option.none()
            : Option.some(path.dirname(value)),
        ] as const,
    ),
  );

export const discover = Effect.fnUntraced(function* (directory: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.parse(path.resolve(directory)).root;
  const selected = yield* Effect.findFirst(
    Array.filter(parents(path, directory), (candidate) => candidate !== root),
    (candidate) => fs.exists(path.join(candidate, "tsconfig.json")),
  ).pipe(Effect.mapError((cause) => new BuildError.BundlerError({ cause })));
  if (Option.isNone(selected)) return Option.none<TypeScriptConfig>();

  const read = Effect.fnUntraced(
    function* (file: string) {
      const stat = yield* fs.stat(file);
      return yield* Match.value(stat).pipe(
        Match.when({ type: "File" }, () =>
          Effect.gen(function* () {
            const real = yield* fs.realPath(file);
            if (
              path.basename(file) === ".env.local" ||
              path.basename(real) === ".env.local"
            )
              return yield* new DiscoveryRejected({
                path: file,
                reason: "ForbiddenFile",
              });
            const contents = yield* fs.readFileString(real);
            return Option.some({
              path: real,
              tree: Jsonc.parseTree(contents, undefined, {
                allowTrailingComma: true,
              }),
            });
          }),
        ),
        Match.orElse(() => Effect.succeed(Option.none<ConfigSource>())),
      );
    },
    Effect.catch((cause: PlatformError.PlatformError | DiscoveryRejected) => {
      const fail = () => Effect.fail(new BuildError.BundlerError({ cause }));
      return Match.value(cause).pipe(
        Match.tag("PlatformError", ({ reason }) =>
          Match.value(reason).pipe(
            Match.when({ _tag: "NotFound" }, () => Effect.succeedNone),
            Match.when({ _tag: "BadResource" }, ({ cause: platformCause }) =>
              Schema.decodeUnknownOption(NotDirectory)(platformCause).pipe(
                Option.match({
                  onNone: fail,
                  onSome: () => Effect.succeedNone,
                }),
              ),
            ),
            Match.orElse(fail),
          ),
        ),
        Match.tag("TypeScriptConfigDiscoveryRejected", fail),
        Match.exhaustive,
      );
    }),
  );

  const visit = (
    file: string,
    ancestors: HashSet.HashSet<string>,
  ): Effect.Effect<Option.Option<InheritedConfig>, BuildError.BundlerError> =>
    Effect.gen(function* () {
      const source = yield* read(file);
      if (Option.isNone(source)) return Option.none();
      if (HashSet.has(ancestors, source.value.path))
        return Option.some({ aliases: Option.none() });
      const lineage = HashSet.add(ancestors, source.value.path);
      const extension = property(source.value.tree, "extends");
      const inherited = yield* Effect.forEach(
        Array.getSomes(
          Array.map(
            Match.value(extension).pipe(
              Match.when({ type: "array" }, (array) => array.children ?? []),
              Match.orElse((node) => [node]),
            ),
            string,
          ),
        ),
        (value) => extend(path.dirname(source.value.path), value, lineage),
      );
      const paths = property(
        property(source.value.tree, "compilerOptions"),
        "paths",
      );
      const aliases = Match.value(paths).pipe(
        Match.when({ type: "object" }, (object) =>
          Option.some(
            Array.getSomes(
              Array.map(object.children ?? [], (entry) =>
                string(entry.children?.[0]),
              ),
            ),
          ),
        ),
        Match.orElse(() =>
          Array.reduce(
            inherited,
            Option.none<ReadonlyArray<string>>(),
            (previous, base) =>
              Option.orElse(
                Option.flatMap(base, (config) => config.aliases),
                () => previous,
              ),
          ),
        ),
      );
      return Option.some({ aliases });
    });

  const extend = (
    from: string,
    value: string,
    ancestors: HashSet.HashSet<string>,
  ): Effect.Effect<Option.Option<InheritedConfig>, BuildError.BundlerError> =>
    Effect.gen(function* () {
      if (String.isEmpty(value)) return Option.none();
      if (path.isAbsolute(value) || /^(?:\.{1,2}(?:[\\/]|$))/.test(value)) {
        const file = path.resolve(
          from,
          value === "." || value === ".." ? `${value}/tsconfig.json` : value,
        );
        const found = yield* visit(file, ancestors);
        return Option.isSome(found) || String.endsWith(".json")(file)
          ? found
          : yield* visit(`${file}.json`, ancestors);
      }
      const parts = String.split(value, "/");
      const packageName = Array.join(
        Array.take(parts, String.startsWith("@")(value) ? 2 : 1),
        "/",
      );
      for (const current of parents(path, from)) {
        if (path.basename(current) === "node_modules") continue;
        const packageDirectory = path.join(
          current,
          "node_modules",
          packageName,
        );
        const manifestPath = path.join(packageDirectory, "package.json");
        const manifest = yield* read(manifestPath);
        let base = path.join(current, "node_modules", value);
        if (Option.isSome(manifest)) {
          const config = string(property(manifest.value.tree, "tsconfig"));
          if (Option.isSome(config) && String.isNonEmpty(config.value))
            base = path.resolve(packageDirectory, config.value);
          const exports = property(manifest.value.tree, "exports");
          const target = Match.value(exports).pipe(
            Match.whenOr(
              { type: "string" },
              { type: "array" },
              { type: "object" },
              () =>
                Option.liftThrowable(() =>
                  Exsolve.resolveModulePath(value, {
                    from: manifestPath,
                    conditions: ["node", "require", "module"],
                    cache: false,
                  }),
                )(),
            ),
            Match.orElse(() => Option.none()),
          );
          if (Option.isSome(target)) {
            const found = yield* visit(target.value, ancestors);
            if (Option.isSome(found)) return found;
          }
        }
        for (const file of [
          path.join(base, "tsconfig.json"),
          base,
          `${base}.json`,
        ]) {
          const found = yield* visit(file, ancestors);
          if (Option.isSome(found)) return found;
        }
      }
      const legacy = Option.liftThrowable(() =>
        NodeModule.createRequire(path.join(from, "tsconfig.json")).resolve(
          value,
        ),
      )();
      return Option.isSome(legacy)
        ? yield* visit(legacy.value, ancestors)
        : Option.none();
    });

  const file = path.join(selected.value, "tsconfig.json");
  const config = yield* visit(file, HashSet.empty());
  if (Option.isNone(config))
    return yield* new BuildError.BundlerError({
      cause: new DiscoveryRejected({ path: file, reason: "NotRegularFile" }),
    });
  return Option.some({
    path: file,
    aliases: Option.getOrElse(config.value.aliases, () => []),
  });
});

export const buildOptions = (
  self: Option.Option<TypeScriptConfig>,
): Pick<esbuild.BuildOptions, "tsconfig" | "tsconfigRaw"> =>
  Option.match(self, {
    onNone: () => ({ tsconfigRaw: {} }),
    onSome: ({ path }) => ({ tsconfig: path }),
  });

export const aliasPatterns = (
  self: Option.Option<TypeScriptConfig>,
): ReadonlyArray<globalThis.RegExp> =>
  Array.map(
    Option.match(self, { onNone: () => [], onSome: ({ aliases }) => aliases }),
    (alias) =>
      new globalThis.RegExp(
        `^${Array.join(Array.map(String.split(alias, "*"), RegExp.escape), ".*")}$`,
      ),
  );
