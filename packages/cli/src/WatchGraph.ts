import type * as esbuild from "esbuild";

export type WatchGraph = ReadonlyMap<string, ReadonlySet<string>>;

export const make = (
  metafile: esbuild.Metafile,
  resolve: (file: string) => string,
): WatchGraph => {
  const importers = new Map<string, Set<string>>();
  for (const [file, input] of Object.entries(metafile.inputs)) {
    const importer = resolve(file);
    if (!importers.has(importer)) importers.set(importer, new Set());
    for (const dependency of input.imports) {
      if (dependency.external) continue;
      const imported = resolve(dependency.path);
      const parents = importers.get(imported) ?? new Set<string>();
      parents.add(importer);
      importers.set(imported, parents);
    }
  }
  return importers;
};

export const affected = (
  graph: WatchGraph,
  changed: ReadonlyArray<string>,
): ReadonlySet<string> => {
  const visited = new Set(changed);
  const pending = [...changed];
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined) break;
    for (const importer of graph.get(file) ?? []) {
      if (visited.has(importer)) continue;
      visited.add(importer);
      pending.push(importer);
    }
  }
  return visited;
};
