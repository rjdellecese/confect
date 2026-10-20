import type { Compiler, Module, RuleSetRule } from "@rspack/core";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";

export class Unsupported extends Schema.TaggedError<Unsupported>()(
  "RspackComponentsUnsupported",
  { importer: Schema.String, request: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `${this.reason}: ${this.request} from ${this.importer}`;
  }
}

const sourceQuery = "?confect-component-source";
const suffix = /[/\\]convex\.config(\.[cm]?[jt]s)?$/;
const literal = Schema.encodeSync(Schema.fromJsonString(Schema.String));

export const isDefinition = (file: string): boolean =>
  /convex\.config/.test(file);

const unsupported = (
  module: Pick<Module, "dependencies" | "blocks">,
  importer: string,
): Unsupported | undefined => {
  for (const dependency of module.dependencies) {
    if (
      dependency.request &&
      isDefinition(dependency.request) &&
      dependency.category !== "esm"
    )
      return new Unsupported({
        importer,
        request: dependency.request,
        reason: "NonEsmComponentImport",
      });
  }
  for (const block of module.blocks) {
    const failure = unsupported(block, importer);
    if (failure) return failure;
  }
};

export const make = (path: Path.Path) => {
  const wrappers = new Set<string>();
  const sources = new Set<string>();
  const definition = (file: string) => isDefinition(file) || sources.has(file);
  const plugin = (compiler: Compiler) => {
    compiler.hooks.thisCompilation.tap(
      "confect:components",
      (compilation, { normalModuleFactory: factory }) => {
        wrappers.clear();
        sources.clear();
        const resolver = factory.getResolver("normal", {
          dependencyType: "esm",
          fullySpecified: false,
        });
        factory.hooks.beforeResolve.tapPromise("confect:components", (data) =>
          Effect.runPromiseWith(Context.empty())(
            Effect.gen(function* () {
              if (
                !data.contextInfo.issuer ||
                !isDefinition(data.request) ||
                data.request.startsWith("data:") ||
                sources.has(data.request)
              )
                return;
              const specifier = data.request;
              const extension = path.extname(specifier);
              const candidates = [
                specifier,
                ...(extension === ".js"
                  ? [specifier.slice(0, -".js".length) + ".ts"]
                  : []),
                ...(extension !== ".js" && extension !== ".ts"
                  ? [specifier + ".js", specifier + ".ts"]
                  : []),
              ];
              for (const candidate of candidates) {
                const resolved = yield* Effect.callback<string | false>(
                  (resume) => {
                    resolver.resolve(
                      {},
                      data.context,
                      candidate,
                      {
                        fileDependencies: compilation.fileDependencies,
                        missingDependencies: compilation.missingDependencies,
                        contextDependencies: compilation.contextDependencies,
                      },
                      (cause, result) =>
                        resume(
                          Effect.succeed(cause ? false : (result ?? false)),
                        ),
                    );
                  },
                );
                if (!resolved) continue;
                const bare =
                  !specifier.startsWith(".") && !path.isAbsolute(specifier);
                const definitionPath = bare
                  ? specifier.replace(suffix, "")
                  : path.dirname(resolved);
                const contents = [
                  `import real from ${literal(resolved + sourceQuery)};`,
                  `export default { ...real, componentDefinitionPath: ${literal(definitionPath)}, defaultName: real._name };`,
                ].join("\n");
                sources.add(resolved);
                sources.add(resolved + sourceQuery);
                data.request = `data:text/javascript,${encodeURIComponent(contents)}`;
                wrappers.add(data.request);
                return;
              }
            }),
          ),
        );
        compilation.hooks.finishModules.tap("confect:components", (modules) => {
          for (const module of modules) {
            const failure = unsupported(module, module.identifier());
            if (failure) throw failure;
          }
        });
      },
    );
  };
  const rules: RuleSetRule[] = [
    { resource: definition, type: "javascript/auto" },
  ];
  return {
    plugin,
    rules,
    isDefinition: definition,
    isWrapper: (file: string) => wrappers.has(file),
    isSource: (file: string) => sources.has(file),
  };
};
