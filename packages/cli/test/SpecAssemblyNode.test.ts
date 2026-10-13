import * as NodePath from "@effect/platform-node/NodePath";
import { describe, expect, it, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import {
  specImportPathFromGenerated,
  type LeafModule,
} from "@confect/cli/LeafModule";
import { assemblyNodesFromLeaves, render } from "@confect/cli/SpecAssemblyNode";

const leaf = (
  relativePath: string,
  pathSegments: [string, ...string[]],
): LeafModule => ({
  relativePath,
  pathSegments,
  groupPathDot: pathSegments.join("."),
  exportName: pathSegments[pathSegments.length - 1]!,
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
      const contents = yield* render(nodes);

      expect(contents).toContain('import env from "../env.spec";');
      expect(contents).toContain(
        'import notesAndRandom_notes from "../notesAndRandom/notes.spec";',
      );
      expect(contents).toContain(
        'import notesAndRandom_random from "../notesAndRandom/random.spec";',
      );
      expect(contents).toContain(
        `["notesAndRandom"]: GroupSpec.addGroupsAt(GroupSpec.make(), {
    ["notes"]: notesAndRandom_notes,
    ["random"]: notesAndRandom_random,
  })`,
      );
      expect(contents).toContain('["env"]: env,');
      expect(contents).toContain("}> = Spec.fromGroups({");
      expect(contents).not.toContain("as any");
      expect(contents).toContain("const spec: Spec.Spec<");
      expect(contents.match(/\bas\b/g)).toEqual(["as"]);
      expect(contents).toContain("}) as typeof spec;");
      // Group paths are resolved impl-side, so the assembled spec no longer
      // emits a `.addPath(...)` registration chain.
      expect(contents).not.toContain(".addPath(");
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
        const contents = yield* render(nodes);

        expect(contents).toContain('import notes from "../notes.spec";');
        expect(contents).toContain(
          'import notes_archived from "../notes/archived.spec";',
        );
        expect(contents).toContain(
          `["notes"]: GroupSpec.addGroupsAt(notes, {
    ["archived"]: notes_archived,
  })`,
        );
        expect(contents).not.toContain("GroupSpec.make()");
      }),
  );

  it.effect(
    "assembledSpec preserves leaf types in compact explicit annotations",
    () =>
      Effect.gen(function* () {
        const nodes = assemblyNodesFromLeaves([
          leaf("notes.spec.ts", ["notes"]),
          leaf("notes/archived.spec.ts", ["notes", "archived"]),
        ]);
        const contents = yield* render(nodes);

        expect(contents).toContain(
          'import { GroupSpec, Spec } from "@confect/core";',
        );
        expect(contents).toContain("GroupSpec.addGroupsAt(notes, {");
        expect(contents).toContain(
          'GroupSpec.AddGroups<typeof notes, GroupSpec.NamedAt<typeof notes_archived, "archived">>',
        );
        expect(contents).toContain("const spec: Spec.Spec<");
      }),
  );

  it.effect(
    "assembledSpec imports only Spec (not GroupSpec) for an empty spec",
    () =>
      Effect.gen(function* () {
        const contents = yield* render([]);

        expect(contents).toContain('import { Spec } from "@confect/core";');
        expect(contents).not.toContain(
          'import { GroupSpec, Spec } from "@confect/core";',
        );
        expect(contents).toContain(
          "const spec: Spec.Spec = Spec.fromGroups({\n}) as typeof spec;",
        );
        expect(contents).toContain("export default spec;");
      }),
  );

  it.effect(
    "assembledSpec uses GroupSpec.make when a leafless descendant has children",
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
        const contents = yield* render(nodes);

        expect(contents).toContain(
          'import { GroupSpec, Spec } from "@confect/core";',
        );
        expect(contents).toContain(
          `["notes"]: GroupSpec.addGroupsAt(notes, {
    ["archived"]: GroupSpec.addGroupsAt(GroupSpec.make(), {
      ["legacy"]: notes_archived_legacy,
    }),
  })`,
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
        const contents = yield* render(nodes);

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
          '["mutations"]: scripts_operational_inviteUser_mutations,',
        );
        expect(contents).toContain(
          '["queries"]: scripts_operational_inviteUser_queries,',
        );
        expect(contents).toContain(
          '["mutations"]: scripts_operational_seed_mutations,',
        );
        expect(contents).toContain(
          '["mutations"]: scripts_operational_seedTestUser_mutations,',
        );
        expect(contents).toContain(
          '["queries"]: scripts_operational_seedTestUser_queries,',
        );
      }),
  );

  it.effect(
    "assembledSpec assembles every leaf for a deep catalog layout",
    () =>
      Effect.gen(function* () {
        const nodes = assemblyNodesFromLeaves([
          leaf("remix/routes/_app/catalog.spec.ts", [
            "remix",
            "routes",
            "_app",
            "catalog",
          ]),
          leaf("remix/routes/_app/catalog/productId/queries.spec.ts", [
            "remix",
            "routes",
            "_app",
            "catalog",
            "productId",
            "queries",
          ]),
          leaf("remix/routes/_app/catalog/productId/variants.spec.ts", [
            "remix",
            "routes",
            "_app",
            "catalog",
            "productId",
            "variants",
          ]),
          leaf("remix/routes/_app/catalog/productId/details.spec.ts", [
            "remix",
            "routes",
            "_app",
            "catalog",
            "productId",
            "details",
          ]),
        ]);
        const contents = yield* render(nodes);

        expect(contents).toContain(
          "GroupSpec.addGroupsAt(remix_routes__app_catalog, {",
        );
        expect(contents).not.toContain(".addPath(");
      }),
  );
});

for (const { name, pathLayer, sep } of [
  { name: "posix", pathLayer: NodePath.layerPosix, sep: "/" },
  { name: "win32", pathLayer: NodePath.layerWin32, sep: "\\" },
] as const) {
  layer(pathLayer)(`SpecAssemblyNode, discovered as ${name}`, (test) => {
    test.effect("assembledSpec emits POSIX import specifiers", () =>
      Effect.gen(function* () {
        const discovered = (
          relativePath: string,
          pathSegments: [string, ...string[]],
        ) =>
          Effect.map(
            specImportPathFromGenerated(relativePath),
            (specImportPath): LeafModule => ({
              relativePath,
              pathSegments,
              groupPathDot: Array.join(pathSegments, "."),
              exportName: pathSegments[pathSegments.length - 1]!,
              specImportPath,
            }),
          );

        const nodes = assemblyNodesFromLeaves([
          yield* discovered(`notesAndRandom${sep}notes.spec.ts`, [
            "notesAndRandom",
            "notes",
          ]),
          yield* discovered(
            `scripts${sep}operational${sep}seed${sep}mutations.spec.ts`,
            ["scripts", "operational", "seed", "mutations"],
          ),
          yield* discovered("env.spec.ts", ["env"]),
        ]);
        const contents = yield* render(nodes);

        expect(contents).toContain(
          'import notesAndRandom_notes from "../notesAndRandom/notes.spec";',
        );
        expect(contents).toContain(
          'import scripts_operational_seed_mutations from "../scripts/operational/seed/mutations.spec";',
        );
        expect(contents).toContain('import env from "../env.spec";');
        expect(contents).not.toContain("\\");
      }),
    );
  });
}
