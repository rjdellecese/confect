import * as Path from "@effect/platform/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import type * as esbuild from "esbuild";
import { fromBundlerError, type BuildError } from "./BuildError";
import * as Bundler from "./Bundler";
import { InvalidConvexConfigError } from "./CodegenError";

export const CONVEX_CONFIG_FILENAME = "convex.config.ts";

/**
 * A component installed on the app via `app.use(...)` in
 * `convex/convex.config.ts`.
 */
export interface InstalledComponent {
  /**
   * The mount name (`app.use`'s `name` option, falling back to the name the
   * component was defined with).
   */
  readonly name: string;
  /**
   * Where the component's definition was imported from: the original import
   * specifier when it was bare (e.g. `@convex-dev/workpool/convex.config`),
   * or the resolved absolute path when it was relative (a locally-defined
   * component).
   */
  readonly componentDefinitionPath: string;
}

const COMPONENT_CONFIG_NAMESPACE = "confect-component-config";

/**
 * Matches the trailing `convex.config` segment of a component-definition
 * import (with or without an extension), e.g.
 * `@convex-dev/workpool/convex.config` or `./waitlist/convex.config.ts`.
 */
const CONVEX_CONFIG_SUFFIX = /[/\\]convex\.config(\.[cm]?[jt]s)?$/;

/**
 * `convex/server`'s `app.use(definition)` rejects any definition object that
 * lacks a string `componentDefinitionPath` ("This code only works in Convex
 * runtime"): that property is normally stamped on by the Convex backend's
 * module system when it evaluates a definition bundle. To evaluate
 * `convex.config.ts` in plain Node, this plugin intercepts every non-entry
 * import of a `convex.config` module (mirroring the Convex CLI's own
 * `componentPlugin`) and swaps in a virtual wrapper that re-exports the real
 * definition with `componentDefinitionPath` and `defaultName` filled in — the
 * exact shape of Convex's `ImportedComponentDefinition`.
 */
export const componentConfigPlugin = (path: Path.Path): esbuild.Plugin => ({
  name: "confect:component-config",
  setup(build) {
    build.onResolve({ filter: /convex\.config/ }, (args) => {
      // The app's own `convex.config.ts` is the entry point; only imports of
      // *component* definitions get wrapped. Skipping non-file namespaces
      // also stops the wrapper's own import of the real module (whose
      // importer lives in this plugin's namespace) from recursing.
      if (args.kind === "entry-point") return undefined;
      if (args.namespace !== "file" && args.namespace !== "") return undefined;

      const importer =
        args.importer !== "" ? args.importer : path.join(args.resolveDir, "_");

      // Component definitions are conventionally imported extensionless
      // (`.../convex.config`), which npm `exports` maps resolve but plain
      // file resolution may not — probe the same candidates Convex does.
      const extension = path.extname(args.path);
      const candidates = [
        args.path,
        ...(extension === ".js"
          ? [args.path.slice(0, -".js".length) + ".ts"]
          : []),
        ...(extension !== ".js" && extension !== ".ts"
          ? [args.path + ".js", args.path + ".ts"]
          : []),
      ];

      return pipe(
        candidates,
        Array.filterMap((candidate) =>
          Bundler.resolveModule(candidate, importer),
        ),
        Array.head,
        Option.match({
          onNone: () => undefined,
          onSome: (resolved) => ({
            path: resolved,
            namespace: COMPONENT_CONFIG_NAMESPACE,
            pluginData: { specifier: args.path },
          }),
        }),
      );
    });

    build.onLoad(
      { filter: /.*/, namespace: COMPONENT_CONFIG_NAMESPACE },
      (args) => {
        const specifier = (args.pluginData as { specifier: string }).specifier;
        // Convex's codegen doesn't trust relative specifiers as identifiers
        // (the importer's location is lost after bundling), so record the
        // resolved absolute path for those; bare specifiers are kept verbatim
        // so the generated type import stays a package specifier.
        const isBareSpecifier =
          !specifier.startsWith(".") && !path.isAbsolute(specifier);
        const componentDefinitionPath = isBareSpecifier ? specifier : args.path;

        // The real module is imported (not inlined) so that an npm component
        // definition is externalized by `bundle-require` and evaluated from
        // its own on-disk location, while a locally-defined `.ts` component
        // gets bundled. `defaultName` comes from `defineComponent(name)`'s
        // `_name`, keeping `app.use`'s name resolution identical to the
        // Convex runtime's.
        return {
          loader: "js",
          resolveDir: path.dirname(args.path),
          contents: [
            `import real from ${JSON.stringify(args.path)};`,
            `export default { ...real, componentDefinitionPath: ${JSON.stringify(componentDefinitionPath)}, defaultName: real._name };`,
          ].join("\n"),
        };
      },
    );
  },
});

/**
 * The subset of `app.export()` (Convex's `AppDefinitionAnalysis`) that the
 * registry needs: each installed component's mount name and the
 * `componentDefinitionPath` injected by {@link componentConfigPlugin}.
 */
const AppDefinitionAnalysis = Schema.Struct({
  childComponents: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      path: Schema.String,
    }),
  ),
});

const byName = Order.mapInput(
  Order.string,
  (component: InstalledComponent) => component.name,
);

/**
 * Bundle and evaluate `convex/convex.config.ts` and list the components
 * installed on the app, in mount-name order. `displayPath` is used in error
 * messages (mirroring how impl/spec bundling reports relative paths).
 */
export const discoverInstalledComponents = (
  convexConfigPath: string,
  displayPath: string,
): Effect.Effect<
  ReadonlyArray<InstalledComponent>,
  BuildError | InvalidConvexConfigError,
  Path.Path
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    const { module } = yield* Bundler.bundle(convexConfigPath, {
      plugins: [componentConfigPlugin(path)],
    }).pipe(Effect.mapError((error) => fromBundlerError(displayPath, error)));

    const app = module.default as
      | { _isRoot?: unknown; export?: unknown }
      | null
      | undefined;

    if (
      app === null ||
      typeof app !== "object" ||
      app._isRoot !== true ||
      typeof app.export !== "function"
    ) {
      return yield* new InvalidConvexConfigError({
        configPath: displayPath,
        reason:
          "it must default-export the app definition created by `defineApp()`.",
      });
    }

    const analysis = yield* Effect.try({
      try: () => (app.export as () => unknown)(),
      catch: (cause) =>
        new InvalidConvexConfigError({
          configPath: displayPath,
          reason: `exporting the app definition threw: ${String(cause)}.`,
        }),
    });

    const decoded = yield* Schema.decodeUnknown(AppDefinitionAnalysis)(
      analysis,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new InvalidConvexConfigError({
            configPath: displayPath,
            reason: `the app definition's installed components could not be read: ${cause.message}.`,
          }),
      ),
    );

    const components = pipe(
      decoded.childComponents,
      Array.map(
        ({ name, path: componentDefinitionPath }): InstalledComponent => ({
          name,
          componentDefinitionPath,
        }),
      ),
      Array.sort(byName),
    );

    const duplicateNames = pipe(
      components,
      Array.groupBy(({ name }) => name),
      Record.toEntries,
      Array.filter(([, group]) => group.length > 1),
      Array.map(([name]) => name),
    );
    if (Array.isNonEmptyReadonlyArray(duplicateNames)) {
      return yield* new InvalidConvexConfigError({
        configPath: displayPath,
        reason: `multiple components are installed under the same name (${Array.join(duplicateNames, ", ")}); pass a unique \`name\` to \`app.use\` for each.`,
      });
    }

    return components;
  });

/**
 * The module specifier the generated registry's `ComponentApi` type import
 * should use for a component, following Convex's own codegen convention:
 * `<definition path minus the trailing convex.config segment>/_generated/component.js`.
 * Bare (npm) definition paths are used verbatim; locally-defined components
 * (recorded as absolute paths) become a relative path from
 * `confect/_generated`.
 */
export const typeImportPath = (
  path: Path.Path,
  componentDefinitionPath: string,
  confectGeneratedDirectory: string,
): string => {
  const stripped = componentDefinitionPath.replace(CONVEX_CONFIG_SUFFIX, "");
  if (!path.isAbsolute(stripped)) {
    return stripped;
  }
  const relative = path
    .relative(confectGeneratedDirectory, stripped)
    .split(path.sep)
    .join("/");
  return relative.startsWith(".") ? relative : `./${relative}`;
};
