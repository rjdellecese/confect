import type { ExternalItemFunctionData, ResolveOptions } from "@rspack/core";
import * as Cache from "effect/Cache";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type * as RspackInputs from "./RspackInputs.ts";

export class Unproven extends Schema.TaggedError<Unproven>()(
  "RspackRuntimeUnproven",
  {
    request: Schema.String,
    importer: Schema.String,
    reason: Schema.Literals([
      "UnsafeRequest",
      "MissingNativeResolver",
      "NativeResolution",
      "UnsafeNativeResult",
      "InvalidMetadata",
      "UnsupportedExports",
      "AmbiguousMetadata",
      "SelfReference",
      "OutsidePackage",
      "LegacyDisagreement",
    ]),
  },
) {}

const Metadata = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  exports: Schema.optionalKey(Schema.Unknown),
});

const safeSegments = (value: string, wildcard: boolean) =>
  (!wildcard || value.indexOf("*") === value.lastIndexOf("*")) &&
  value
    .split("/")
    .every(
      (segment) =>
        segment !== "." &&
        segment !== ".." &&
        segment.toLowerCase() !== "node_modules" &&
        (wildcard ? /^[A-Za-z0-9_~.*+-]+$/ : /^[A-Za-z0-9_~.+-]+$/).test(
          segment,
        ),
    );

const safeExports = (value: unknown, subpaths = true, depth = 0): boolean => {
  if (depth > 16) return false;
  if (value === null) return !subpaths;
  if (typeof value === "string")
    return value.startsWith("./") && safeSegments(value.slice(2), true);
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length === 0) return false;
  const keys = entries.map(([key]) => key);
  const paths = keys.every(
    (key) =>
      key === "." || (key.startsWith("./") && safeSegments(key.slice(2), true)),
  );
  const conditions = keys.every((key) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key));
  return (
    ((subpaths && paths) || conditions) &&
    entries.every(([, target]) => safeExports(target, false, depth + 1))
  );
};

interface Resolution {
  readonly path: string;
  readonly description: string | undefined;
}

export const make = Effect.fn("RspackRuntime.make")(function* (options: {
  readonly configuration: string;
  readonly conditions: ReadonlyArray<string>;
  readonly readFile: (
    file: string,
  ) => Effect.Effect<Uint8Array, RspackInputs.Failed | RspackInputs.Changed>;
  readonly ensure: Effect.Effect<
    void,
    RspackInputs.Failed | RspackInputs.Changed
  >;
}) {
  const path = yield* Path.Path;
  const bytes = yield* Cache.makeWith(options.readFile, {
    capacity: 1024,
    timeToLive: (exit) => (Exit.isSuccess(exit) ? Infinity : 0),
  });
  const resolve = Effect.fn("RspackRuntime.resolve")(function* (
    data: ExternalItemFunctionData,
  ) {
    const request = data.request ?? "";
    const importer = data.contextInfo?.issuer ?? "";
    const unproven = (reason: Unproven["reason"]) =>
      new Unproven({ request, importer, reason });
    const acquire = Effect.gen(function* () {
      yield* options.ensure;
      const segments = request.split("/");
      const packageLength = request.startsWith("@") ? 2 : 1;
      const packageName = segments.slice(0, packageLength).join("/");
      if (
        !path.isAbsolute(importer) ||
        request.startsWith(".") ||
        !safeSegments(
          request.startsWith("@") ? request.slice(1) : request,
          false,
        ) ||
        segments.length < packageLength ||
        !/^[A-Za-z0-9_~+-]/.test(segments[0]?.replace(/^@/, "") ?? "") ||
        (packageLength === 2 && !/^[A-Za-z0-9_~+-]/.test(segments[1] ?? ""))
      )
        return yield* unproven("UnsafeRequest");
      const getResolve = data.getResolve;
      if (!getResolve) return yield* unproven("MissingNativeResolver");
      const context = path.dirname(importer);
      const native = (
        specifier: string,
        mode: "import" | "require",
        strict: boolean,
        metadata = false,
      ) =>
        Effect.callback<Resolution, Unproven>((resume) => {
          const configuration: ResolveOptions = {
            alias: false,
            fallback: false,
            aliasFields: [],
            extensionAlias: {},
            tsConfig: { configFile: options.configuration },
            mainFields: strict ? [] : ["main"],
            mainFiles: strict ? [] : ["index"],
            extensions: strict ? [] : [".js", ".json", ".node"],
            conditionNames: [mode, ...options.conditions],
            fullySpecified: mode === "import",
            symlinks: true,
            modules: ["node_modules"],
            preferRelative: false,
            preferAbsolute: false,
            exportsFields: metadata ? [] : ["exports"],
            importsFields: ["imports"],
            byDependency: {},
            pnp: false,
          };
          try {
            getResolve(configuration)(
              context,
              specifier,
              (error, _, details) => {
                if (error || !details)
                  return resume(Effect.fail(unproven("NativeResolution")));
                if (
                  !path.isAbsolute(details.path) ||
                  /[%?#\\]/.test(details.path) ||
                  Array.from(details.path).some(
                    (character) =>
                      character.charCodeAt(0) < 32 ||
                      character.charCodeAt(0) === 127,
                  ) ||
                  details.query ||
                  details.fragment
                )
                  return resume(Effect.fail(unproven("UnsafeNativeResult")));
                resume(
                  Effect.succeed({
                    path: details.path,
                    description: details.descriptionFilePath ?? undefined,
                  }),
                );
              },
            );
          } catch {
            resume(Effect.fail(unproven("NativeResolution")));
          }
        }).pipe(Effect.tap(() => options.ensure));
      const metadata = (file: string) =>
        Cache.get(bytes, file).pipe(
          Effect.flatMap((contents) =>
            Schema.decodeEffect(Schema.fromJsonString(Metadata))(
              new TextDecoder().decode(contents),
            ).pipe(Effect.mapError(() => unproven("InvalidMetadata"))),
          ),
        );
      const source = yield* native(importer, "require", true);
      if (source.description) {
        if (!path.isAbsolute(source.description))
          return yield* unproven("AmbiguousMetadata");
        const scope = yield* metadata(
          path.join(source.description, "package.json"),
        );
        if (scope.name === packageName) return yield* unproven("SelfReference");
      }
      const manifest = yield* native(
        `${packageName}/package.json`,
        "require",
        true,
        true,
      );
      const root = path.dirname(manifest.path);
      if (
        path.basename(manifest.path) !== "package.json" ||
        manifest.description !== root
      )
        return yield* unproven("AmbiguousMetadata");
      const described = yield* metadata(manifest.path);
      if (described.name !== undefined && described.name !== packageName)
        return yield* unproven("AmbiguousMetadata");
      if (!safeExports(described.exports))
        return yield* unproven("UnsupportedExports");
      const required = yield* native(request, "require", true);
      const imported = yield* native(request, "import", true);
      for (const target of [required, imported]) {
        const relative = path.relative(root, target.path);
        if (
          !relative ||
          relative === ".." ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)
        )
          return yield* unproven("OutsidePackage");
      }
      const legacyRequired = yield* native(request, "require", false);
      const legacyImported = yield* native(request, "import", false);
      if (
        required.path !== legacyRequired.path ||
        imported.path !== legacyImported.path
      )
        return yield* unproven("LegacyDisagreement");
      yield* options.ensure;
      return { required: required.path, imported: imported.path };
    });
    return yield* acquire.pipe(
      Effect.catchTag("RspackRuntimeUnproven", (error) =>
        options.ensure.pipe(Effect.andThen(Effect.fail(error))),
      ),
    );
  });
  return { resolve };
});
