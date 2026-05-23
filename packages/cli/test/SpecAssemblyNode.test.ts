import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { LeafModule } from "../src/LeafModule";
import { assemblyNodesFromLeaves } from "../src/SpecAssemblyNode";
import * as templates from "../src/templates";

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
  specImportPath: `../${relativePath.slice(0, -".ts".length)}`,
});

describe("SpecAssemblyNode", () => {
  it.effect("assembledSpec builds nested imports from leaf modules", () =>
    Effect.gen(function* () {
      const nodes = assemblyNodesFromLeaves([
        leaf("notesAndRandom/notes.spec.ts", ["notesAndRandom", "notes"]),
        leaf("notesAndRandom/random.spec.ts", ["notesAndRandom", "random"]),
        leaf("env.spec.ts", ["env"]),
      ]);
      const contents = yield* templates.assembledSpec({
        nodes,
        runtime: "Convex",
      });

      expect(contents).toContain('import env from "../env.spec";');
      expect(contents).toContain(
        'import notes from "../notesAndRandom/notes.spec";',
      );
      expect(contents).toContain(
        'GroupSpec.makeAt("notesAndRandom").addGroupAt("notes", notes).addGroupAt("random", random)',
      );
      expect(contents).toContain('.addAt("env", env)');
    }),
  );
});
