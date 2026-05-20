import { describe, expect, test } from "@effect/vitest";
import {
  buildSpecTree,
  collectSpecAssemblyNodes,
  emitAssembledSpec,
} from "../src/specAssembly";
import type { LeafModule } from "../src/modulePaths";

const leaf = (
  relativePath: string,
  pathSegments: [string, ...string[]],
): LeafModule => ({
  relativePath,
  pathSegments,
  groupPathDot: pathSegments.join("."),
  registryGroupPathDot: pathSegments.join("."),
  exportName: pathSegments[pathSegments.length - 1]!,
  runtime: "Convex",
});

describe("specAssembly", () => {
  test("emitAssembledSpec builds nested imports from leaf modules", () => {
    const tree = buildSpecTree([
      leaf("notesAndRandom/notes.spec.ts", ["notesAndRandom", "notes"]),
      leaf("notesAndRandom/random.spec.ts", ["notesAndRandom", "random"]),
      leaf("env.spec.ts", ["env"]),
    ]);
    const nodes = collectSpecAssemblyNodes(tree);
    const contents = emitAssembledSpec(nodes, "Convex");

    expect(contents).toContain('import env from "../env.spec";');
    expect(contents).toContain('import notes from "../notesAndRandom/notes.spec";');
    expect(contents).toContain(
      'GroupSpec.makeAt("notesAndRandom").addGroupAt("notes", notes).addGroupAt("random", random)',
    );
    expect(contents).toContain('.addAt("env", env)');
  });
});
