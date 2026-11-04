import { dual } from "effect/Function";
import * as Record from "effect/Record";
import type * as esbuild from "esbuild";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Option from "effect/Option";

export type WatchGraph = HashMap.HashMap<string, HashSet.HashSet<string>>;

export const make: {
  (
    resolve: (file: string) => string,
  ): (metafile: esbuild.Metafile) => WatchGraph;
  (metafile: esbuild.Metafile, resolve: (file: string) => string): WatchGraph;
} = dual(
  2,
  (
    metafile: esbuild.Metafile,
    resolve: (file: string) => string,
  ): WatchGraph => {
    let importers = HashMap.empty<string, HashSet.HashSet<string>>();
    for (const [file, input] of Record.toEntries(metafile.inputs)) {
      const importer = resolve(file);
      for (const dependency of input.imports) {
        if (dependency.external === true) continue;
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
  },
);

export const affected: {
  (
    changed: ReadonlyArray<string>,
  ): (graph: WatchGraph) => HashSet.HashSet<string>;
  (graph: WatchGraph, changed: ReadonlyArray<string>): HashSet.HashSet<string>;
} = dual(
  2,
  (
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
  },
);
