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
        'import notesAndRandom_notes from "../notesAndRandom/notes.spec";',
      );
      expect(contents).toContain(
        'import notesAndRandom_random from "../notesAndRandom/random.spec";',
      );
      expect(contents).toContain(
        'GroupSpec.makeAt("notesAndRandom").addGroupAt("notes", notesAndRandom_notes).addGroupAt("random", notesAndRandom_random)',
      );
      expect(contents).toContain('.addAt("env", env)');
    }),
  );

  it.effect(
    "assembledSpec preserves a parent leaf when sibling subdirectory specs exist",
    () =>
      Effect.gen(function* () {
        const nodes = assemblyNodesFromLeaves([
          leaf("notes.spec.ts", ["notes"]),
          leaf("notes/archived.spec.ts", ["notes", "archived"]),
        ]);
        const contents = yield* templates.assembledSpec({
          nodes,
          runtime: "Convex",
        });

        expect(contents).toContain('import notes from "../notes.spec";');
        expect(contents).toContain(
          'import notes_archived from "../notes/archived.spec";',
        );
        expect(contents).toContain(
          '.addAt("notes", notes.addGroupAt("archived", notes_archived))',
        );
        expect(contents).not.toContain('GroupSpec.makeAt("notes")');
      }),
  );

  it.effect(
    "assembledSpec only imports GroupSpec when at least one node lacks a leaf binding",
    () =>
      Effect.gen(function* () {
        const nodes = assemblyNodesFromLeaves([
          leaf("notes.spec.ts", ["notes"]),
          leaf("notes/archived.spec.ts", ["notes", "archived"]),
        ]);
        const contents = yield* templates.assembledSpec({
          nodes,
          runtime: "Convex",
        });

        expect(contents).toContain('import { Spec } from "@confect/core";');
        expect(contents).not.toContain(
          'import { GroupSpec, Spec } from "@confect/core";',
        );
      }),
  );

  it.effect(
    "assembledSpec keeps GroupSpec.makeAt when a leafless descendant has children",
    () =>
      Effect.gen(function* () {
        const nodes = assemblyNodesFromLeaves([
          leaf("notes.spec.ts", ["notes"]),
          leaf("notes/archived/legacy.spec.ts", [
            "notes",
            "archived",
            "legacy",
          ]),
        ]);
        const contents = yield* templates.assembledSpec({
          nodes,
          runtime: "Convex",
        });

        expect(contents).toContain(
          'import { GroupSpec, Spec } from "@confect/core";',
        );
        expect(contents).toContain(
          '.addAt("notes", notes.addGroupAt("archived", GroupSpec.makeAt("archived").addGroupAt("legacy", notes_archived_legacy)))',
        );
      }),
  );

  it.effect(
    "assembledSpec gives every leaf a unique import binding when sibling specs share a basename",
    () =>
      Effect.gen(function* () {
        const leaves = [
          leaf("scripts/operational/inviteUser/mutations.spec.ts", [
            "scripts",
            "operational",
            "inviteUser",
            "mutations",
          ]),
          leaf("scripts/operational/inviteUser/queries.spec.ts", [
            "scripts",
            "operational",
            "inviteUser",
            "queries",
          ]),
          leaf("scripts/operational/seed/mutations.spec.ts", [
            "scripts",
            "operational",
            "seed",
            "mutations",
          ]),
          leaf("scripts/operational/seedTestUser/mutations.spec.ts", [
            "scripts",
            "operational",
            "seedTestUser",
            "mutations",
          ]),
          leaf("scripts/operational/seedTestUser/queries.spec.ts", [
            "scripts",
            "operational",
            "seedTestUser",
            "queries",
          ]),
        ];
        const nodes = assemblyNodesFromLeaves(leaves);
        const contents = yield* templates.assembledSpec({
          nodes,
          runtime: "Convex",
        });

        expect(contents).toContain(
          'import scripts_operational_inviteUser_mutations from "../scripts/operational/inviteUser/mutations.spec";',
        );
        expect(contents).toContain(
          'import scripts_operational_inviteUser_queries from "../scripts/operational/inviteUser/queries.spec";',
        );
        expect(contents).toContain(
          'import scripts_operational_seed_mutations from "../scripts/operational/seed/mutations.spec";',
        );
        expect(contents).toContain(
          'import scripts_operational_seedTestUser_mutations from "../scripts/operational/seedTestUser/mutations.spec";',
        );
        expect(contents).toContain(
          'import scripts_operational_seedTestUser_queries from "../scripts/operational/seedTestUser/queries.spec";',
        );

        const importLines = contents
          .split("\n")
          .filter(
            (line) => line.startsWith("import ") && line.includes(".spec"),
          );
        expect(importLines).toHaveLength(leaves.length);

        expect(contents).toContain(
          '.addGroupAt("mutations", scripts_operational_inviteUser_mutations)',
        );
        expect(contents).toContain(
          '.addGroupAt("queries", scripts_operational_inviteUser_queries)',
        );
        expect(contents).toContain(
          '.addGroupAt("mutations", scripts_operational_seed_mutations)',
        );
        expect(contents).toContain(
          '.addGroupAt("mutations", scripts_operational_seedTestUser_mutations)',
        );
        expect(contents).toContain(
          '.addGroupAt("queries", scripts_operational_seedTestUser_queries)',
        );
      }),
  );
});
