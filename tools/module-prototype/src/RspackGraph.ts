import type { Stats } from "@rspack/core";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Hex from "effect/encoding/Hex";
import * as Schema from "effect/Schema";
import type * as RspackInputs from "./RspackInputs.ts";
import type * as RspackExternals from "./RspackExternals.ts";

export class Failed extends Schema.TaggedError<Failed>()("RspackGraphFailed", {
  reason: Schema.String,
  module: Schema.String,
}) {}

export interface Module {
  readonly id: string;
  readonly type: string;
  readonly file: string | undefined;
  readonly source: string | undefined;
  readonly imports: ReadonlyArray<{
    readonly id: string;
    readonly request: string | undefined;
    readonly type: string;
    readonly category: string;
    readonly attributes: ReadonlyArray<readonly [string, string]>;
  }>;
}

export interface Graph {
  readonly roots: Readonly<Record<string, string>>;
  readonly modules: ReadonlyArray<Module>;
}

const serialize = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

export const capture = (stats: Stats, roots: ReadonlyArray<string>): Graph => {
  const compilation = stats.compilation;
  return {
    roots: Object.fromEntries(
      roots.map((root, index) => {
        const entry = compilation.entries.get(String(index));
        const dependency = entry?.dependencies[0];
        const module =
          dependency && compilation.moduleGraph.getModule(dependency);
        if (!module) throw new Failed({ reason: "MissingEntry", module: root });
        return [root, module.identifier()];
      }),
    ),
    modules: [...compilation.modules].map((module) => ({
      id: module.identifier(),
      type: module.type,
      file: module.nameForCondition(),
      source: module.originalSource()?.source().toString(),
      imports: compilation.moduleGraph
        .getOutgoingConnections(module)
        .flatMap((connection) => {
          const target = connection.module;
          if (!target) return [];
          const dependency = connection.dependency;
          return [
            {
              id: target.identifier(),
              request: dependency.request,
              type: dependency.type,
              category: dependency.category,
              attributes: Object.entries(dependency.attributes ?? {}).sort(
                ([a], [b]) => a.localeCompare(b),
              ),
            },
          ];
        }),
    })),
  };
};

export const fingerprints = Effect.fn("RspackGraph.fingerprints")(function* (
  graph: Graph,
  observations: ReadonlyArray<RspackInputs.Observation>,
  external: ReadonlyArray<RspackExternals.Observation>,
  owned: (file: string) => boolean = () => false,
  virtual: (file: string) => boolean = () => false,
) {
  const crypto = yield* Crypto.Crypto;
  const bytes = new Map(
    observations
      .filter((item) => item.method === "readFile")
      .map((item) => [item.path, item.fingerprint]),
  );
  const modules = new Map(graph.modules.map((module) => [module.id, module]));
  const serialized = new Map<string, string>();
  for (const observation of external) {
    if (!graph.modules.some((module) => module.file === observation.importer))
      return yield* new Failed({
        reason: "UnassignedExternal",
        module: observation.importer,
      });
  }
  for (const module of graph.modules) {
    const input = module.file && bytes.get(module.file);
    if (
      module.file &&
      !virtual(module.file) &&
      module.source !== undefined &&
      !input
    ) {
      return yield* new Failed({
        reason: "UnobservedSource",
        module: module.id,
      });
    }
    serialized.set(
      module.id,
      serialize({
        id: module.id,
        type: module.type,
        file: module.file,
        input: module.file && owned(module.file) ? undefined : input,
        source: module.file && owned(module.file) ? undefined : module.source,
        external: [
          ...new Set(
            external
              .filter((observation) => observation.importer === module.file)
              .map((observation) => serialize(observation)),
          ),
        ].sort(),
        imports: module.imports.map((edge) => serialize(edge)).sort(),
      }),
    );
  }
  const values: Record<string, string> = {};
  for (const [root, entry] of Object.entries(graph.roots)) {
    const pending = [entry];
    const visited = new Set<string>();
    for (let index = 0; index < pending.length; index++) {
      const id = pending[index];
      if (visited.has(id)) continue;
      visited.add(id);
      const module = modules.get(id);
      if (!module)
        return yield* new Failed({ reason: "MissingModule", module: id });
      pending.push(...module.imports.map((edge) => edge.id));
    }
    const value = [...visited]
      .sort()
      .map((id) => serialized.get(id))
      .join("\n");
    values[root] = Hex.encode(
      yield* crypto.digest("SHA-256", new TextEncoder().encode(value)),
    );
  }
  return values;
});
