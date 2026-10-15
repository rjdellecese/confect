import type * as esbuild from "esbuild";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Option from "effect/Option";

export type WatchGraph = HashMap.HashMap<string, HashSet.HashSet<string>>;

export const make = (
  metafile: esbuild.Metafile,
  resolve: (file: string) => string,
): WatchGraph => {
  let importers = HashMap.empty<string, HashSet.HashSet<string>>();
  for (const [file, input] of Object.entries(metafile.inputs)) {
    const importer = resolve(file);
    for (const dependency of input.imports) {
      if (dependency.external) continue;
      const imported = resolve(dependency.path);
      const parents = Option.getOrElse(HashMap.get(importers, imported), () =>
        HashSet.empty<string>(),
      );
      importers = HashMap.set(
        importers,
        imported,
        HashSet.add(parents, importer),
      );
    }
  }
  return importers;
};

export const affected = (
  graph: WatchGraph,
  changed: ReadonlyArray<string>,
): HashSet.HashSet<string> => {
  let visited = HashSet.fromIterable(changed);
  const pending = [...changed];
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined) break;
    for (const importer of Option.getOrElse(HashMap.get(graph, file), () =>
      HashSet.empty<string>(),
    )) {
      if (HashSet.has(visited, importer)) continue;
      visited = HashSet.add(visited, importer);
      pending.push(importer);
    }
  }
  return visited;
};
