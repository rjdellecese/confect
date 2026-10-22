import * as NodePath from "@effect/platform-node/NodePath";
import { describe, expect, it, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { GroupSpec } from "@confect/core";
import {
  specImportPathFromGenerated,
  type LeafModule,
} from "@confect/cli/LeafModule";
import {
  assemblyNodesFromLeaves,
  render,
  renderScopedRefs,
  scopedNodesFromLeaves,
  SCOPED_REFS_HEADER,
} from "@confect/cli/SpecAssemblyNode";

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
  it.effect(
    "plans every filesystem node, including intermediate directories",
    () =>
      Effect.gen(function* () {
        const scopes = yield* scopedNodesFromLeaves([
          leaf("notes/archived/legacy.spec.ts", [
            "notes",
            "archived",
            "legacy",
          ]),
          leaf("notes.spec.ts", ["notes"]),
          leaf("env.spec.ts", ["env"]),
        ]);

        expect(scopes.map(({ path }) => path.pathSegments)).toEqual([
          ["env"],
          ["notes"],
          ["notes", "archived"],
          ["notes", "archived", "legacy"],
        ]);
        const [env, notes, archived, legacy] = scopes;
        expect(Option.isSome(env!.node.importBinding)).toBe(true);
        expect(Option.isSome(notes!.node.importBinding)).toBe(true);
        expect(Option.isNone(archived!.node.importBinding)).toBe(true);
        expect(Option.isSome(legacy!.node.importBinding)).toBe(true);
        expect(notes!.node.children[0]).toBe(archived!.node);
        expect(archived!.node.children[0]).toBe(legacy!.node);
      }),
  );

  it.effect(
    "plans no files for declaration-internal groups or empty inputs",
    () =>
      Effect.gen(function* () {
        const declaration = {
          ...leaf("notes.spec.ts", ["notes"]),
          spec: GroupSpec.addGroupsAt(GroupSpec.make(), {
            internal: GroupSpec.make(),
          }),
        };
        const scopes = yield* scopedNodesFromLeaves([declaration]);

        expect(scopes.map(({ path }) => path.pathSegments)).toEqual([
          ["notes"],
        ]);
        expect(scopes[0]!.node.children).toEqual([]);
        expect(yield* scopedNodesFromLeaves([])).toEqual([]);
      }),
  );

  it.effect("derives scoped paths from parsed declaration paths", () =>
    Effect.gen(function* () {
      const scopes = yield* scopedNodesFromLeaves([
        leaf("notes/archived.spec.ts", ["stale"]),
      ]);

      expect(scopes.map(({ path }) => path.pathSegments)).toEqual([
        ["notes"],
        ["notes", "archived"],
      ]);
      const { node, path } = scopes[1]!;
      const contents = yield* renderScopedRefs(node, path);
      expect(contents).toContain(
        'import declaration_0 from "../../../notes/archived.spec";',
      );
      expect(contents).not.toContain("stale");
    }),
  );

  it.effect(
    "rejects noncanonical declaration paths through snapshot parsing",
    () =>
      Effect.gen(function* () {
        for (const relativePath of [
          "schema.spec.ts",
          "bad-dir/notes.spec.ts",
          "notes/..spec.ts",
          ".spec.ts",
          "../notes.spec.ts",
          "notes//list.spec.ts",
          "notes/./list.spec.ts",
          "notes.ts",
        ]) {
          const result = yield* Effect.result(
            scopedNodesFromLeaves([leaf(relativePath, ["notes"])]),
          );
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result)) {
            expect(result.failure).toMatchObject({
              _tag: "SnapshotError",
              reason: "NoncanonicalPath",
              relativePath,
            });
          }
        }
      }),
  );

  it.effect("renders only subtree imports at each scoped module depth", () =>
    Effect.gen(function* () {
      const scopes = yield* scopedNodesFromLeaves([
        leaf("notes.spec.ts", ["notes"]),
        leaf("notes/archived/legacy.spec.ts", ["notes", "archived", "legacy"]),
        leaf("notes/recent.spec.ts", ["notes", "recent"]),
        leaf("other.spec.ts", ["other"]),
      ]);
      const [notes, archived, legacy] = scopes;
      const parentContents = yield* renderScopedRefs(notes!.node, notes!.path);
      const intermediateContents = yield* renderScopedRefs(
        archived!.node,
        archived!.path,
      );
      const leafContents = yield* renderScopedRefs(legacy!.node, legacy!.path);

      expect(parentContents).toContain(
        'import declaration_0 from "../../notes.spec";',
      );
      expect(parentContents).toContain(
        'import declaration_0_0_0 from "../../notes/archived/legacy.spec";',
      );
      expect(parentContents).toContain(
        'import declaration_0_1 from "../../notes/recent.spec";',
      );
      expect(parentContents)
        .toContain(`const group = GroupSpec.addGroupsAt(declaration_0, {
  ["archived"]: GroupSpec.addGroupsAt(GroupSpec.make(), {
    ["legacy"]: declaration_0_0_0,
  }),
  ["recent"]: declaration_0_1,
});`);
      expect(parentContents).toContain('Refs.fromGroup("notes", group);');
      expect(intermediateContents).toContain(
        'import declaration_0_0 from "../../../notes/archived/legacy.spec";',
      );
      expect(intermediateContents)
        .toContain(`const group = GroupSpec.addGroupsAt(GroupSpec.make(), {
  ["legacy"]: declaration_0_0,
});`);
      expect(intermediateContents).toContain(
        'Refs.fromGroup("notes/archived", group);',
      );
      expect(leafContents).toContain(
        'import declaration_0 from "../../../../notes/archived/legacy.spec";',
      );
      expect(leafContents).toContain("const group = declaration_0;");
      expect(leafContents).toContain('import { Refs } from "@confect/core";');
      expect(leafContents).not.toContain("GroupSpec");
      for (const contents of [parentContents, intermediateContents]) {
        expect(contents).toContain(
          'import { GroupSpec, Refs } from "@confect/core";',
        );
      }
      expect(leafContents).toContain(
        'Refs.fromGroup("notes/archived/legacy", group);',
      );
      for (const contents of [
        parentContents,
        intermediateContents,
        leafContents,
      ]) {
        expect(contents.startsWith(`${SCOPED_REFS_HEADER}\n`)).toBe(true);
        expect(contents).toContain(
          "const refs: Refs.FromGroup<typeof group> = Refs.fromGroup(",
        );
        expect(contents).toContain("export default refs;");
        expect(contents).not.toContain("other");
        expect(contents).not.toMatch(/\bas\b/);
        expect(contents).not.toContain("spec.ts");
      }
      for (const contents of [intermediateContents, leafContents]) {
        expect(contents).not.toContain('/notes.spec"');
        expect(contents).not.toContain('/notes/recent.spec"');
      }
    }),
  );

  it.effect(
    "keeps input leaves and assembly trees unchanged across renders",
    () =>
      Effect.gen(function* () {
        const leaves = [
          leaf("notes/recent.spec.ts", ["notes", "recent"]),
          leaf("notes.spec.ts", ["notes"]),
        ];
        const originalLeaves = structuredClone(leaves);
        const scopes = yield* scopedNodesFromLeaves(leaves);
        const originalTree = structuredClone(scopes.map(({ node }) => node));
        for (const { node, path } of scopes) {
          const first = yield* renderScopedRefs(node, path);
          expect(yield* renderScopedRefs(node, path)).toBe(first);
        }
        expect(leaves).toEqual(originalLeaves);
        expect(scopes.map(({ node }) => node)).toEqual(originalTree);
      }),
  );

  it.effect(
    "avoids declaration names that collide with generated bindings",
    () =>
      Effect.gen(function* () {
        const scopes = yield* scopedNodesFromLeaves([
          leaf("group.spec.ts", ["group"]),
          ...["refs", "Refs", "GroupSpec", "declaration_0"].map((name) =>
            leaf(`group/${name}.spec.ts`, ["group", name]),
          ),
        ]);
        const root = scopes[0]!;
        const contents = yield* renderScopedRefs(root.node, root.path);
        const imports = contents
          .split("\n")
          .filter((line) => line.startsWith("import declaration_"));
        expect(imports).toHaveLength(5);
        expect(new Set(imports.map((line) => line.split(" ")[1])).size).toBe(5);
        expect(contents).toContain(
          'import declaration_0 from "../../group.spec";',
        );
        expect(contents).toContain(
          "const group = GroupSpec.addGroupsAt(declaration_0, {",
        );
        for (const { node, path } of scopes.slice(1)) {
          const child = yield* renderScopedRefs(node, path);
          expect(child).toContain("const group = declaration_0;");
          expect(child).toContain('import { Refs } from "@confect/core";');
        }
      }),
  );

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

        const scoped = yield* scopedNodesFromLeaves([
          yield* discovered(`notesAndRandom${sep}notes.spec.ts`, [
            "notesAndRandom",
            "notes",
          ]),
        ]);
        expect(scoped.map(({ path }) => path.pathSegments)).toEqual([
          ["notesAndRandom"],
          ["notesAndRandom", "notes"],
        ]);
        const nested = scoped[1]!;
        const scopedContents = yield* renderScopedRefs(
          nested.node,
          nested.path,
        );
        expect(scopedContents).toContain(
          'import declaration_0 from "../../../notesAndRandom/notes.spec";',
        );
        expect(scopedContents).toContain(
          'Refs.fromGroup("notesAndRandom/notes", group);',
        );
        expect(scopedContents).not.toContain("\\");
      }),
    );
  });
}
