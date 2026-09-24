import * as NodePath from "@effect/platform-node/NodePath";
import { describe, expect, it, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  specImportPathFromGenerated,
  type LeafModule,
} from "@confect/cli/LeafModule";
import { assemblyNodesFromLeaves } from "@confect/cli/SpecAssemblyNode";
import * as templates from "@confect/cli/templates";
import { transform } from "esbuild";

const leaf = (
  relativePath: string,
  pathSegments: [string, ...string[]],
): LeafModule => ({
  relativePath,
  pathSegments,
  groupPathDot: pathSegments.join("."),
  exportName: pathSegments[pathSegments.length - 1]!,
  runtime: Option.none(),
  specImportPath: `../${relativePath.slice(0, -".ts".length)}`,
});

describe("SpecAssemblyNode", () => {
  it.effect(
    "keeps keyword API paths while generating distinct valid bindings",
    () =>
      Effect.gen(function* () {
        const nodes = assemblyNodesFromLeaves([
          leaf("public.spec.ts", ["public"]),
          leaf("runtime/protected.spec.ts", ["runtime", "protected"]),
          leaf("Spec.spec.ts", ["Spec"]),
          leaf("GroupSpec.spec.ts", ["GroupSpec"]),
          leaf("spec.spec.ts", ["spec"]),
          leaf("a_b.spec.ts", ["a_b"]),
          leaf("a/b.spec.ts", ["a", "b"]),
        ]);
        const contents = yield* templates.assembledSpec({ nodes });
        yield* Effect.promise(() => transform(contents, { loader: "ts" }));
        expect(contents).toContain('.addAt("public",');
        expect(contents).toContain('.addGroupAt("protected",');
        const imports = contents
          .split("\n")
          .filter((line) => line.includes('from "../'));
        expect(new Set(imports.map((line) => line.split(" ")[1])).size).toBe(7);
      }),
  );

  it.effect(
    "keeps a keyword implementation path out of generated bindings",
    () =>
      Effect.gen(function* () {
        for (const useNode of [false, true]) {
          const contents = yield* templates.registeredFunctionsForGroup({
            schemaImportPath: "../../schema",
            specImportPath: "../../../protected.spec",
            implImportPath: "../../../protected.impl",
            layerExportName: "protected",
            useNode,
          });
          yield* Effect.promise(() => transform(contents, { loader: "ts" }));
          expect(contents).toContain('from "../../../protected.impl";');
          expect(contents).toContain(
            'typeof import("../../../protected.spec")["default"]',
          );
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
      const contents = yield* templates.assembledSpec({ nodes });

      expect(contents).toContain('import $group$3_env from "../env.spec";');
      expect(contents).toContain(
        'import $group$14_notesAndRandom$5_notes from "../notesAndRandom/notes.spec";',
      );
      expect(contents).toContain(
        'import $group$14_notesAndRandom$6_random from "../notesAndRandom/random.spec";',
      );
      expect(contents).toContain(
        'GroupSpec.makeAt("notesAndRandom").addGroupAt("notes", $group$14_notesAndRandom$5_notes).addGroupAt("random", $group$14_notesAndRandom$6_random)',
      );
      expect(contents).toContain('.addAt("env", $group$3_env)');
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
        const contents = yield* templates.assembledSpec({ nodes });

        expect(contents).toContain(
          'import $group$5_notes from "../notes.spec";',
        );
        expect(contents).toContain(
          'import $group$5_notes$8_archived from "../notes/archived.spec";',
        );
        expect(contents).toContain(
          '.addAt("notes", $group$5_notes.addGroupAt("archived", $group$5_notes$8_archived))',
        );
        expect(contents).not.toContain('GroupSpec.makeAt("notes")');
      }),
  );

  it.effect(
    "assembledSpec imports GroupSpec whenever there are groups (for the annotation's NamedAt references)",
    () =>
      Effect.gen(function* () {
        const nodes = assemblyNodesFromLeaves([
          leaf("notes.spec.ts", ["notes"]),
          leaf("notes/archived.spec.ts", ["notes", "archived"]),
        ]);
        const contents = yield* templates.assembledSpec({ nodes });

        expect(contents).toContain(
          'import { GroupSpec, Spec } from "@confect/core";',
        );
        expect(contents).toContain(
          'GroupSpec.AddGroups<typeof $group$5_notes, GroupSpec.NamedAt<typeof $group$5_notes$8_archived, "archived">>',
        );
      }),
  );

  it.effect(
    "assembledSpec imports only Spec (not GroupSpec) for an empty spec",
    () =>
      Effect.gen(function* () {
        const contents = yield* templates.assembledSpec({ nodes: [] });

        expect(contents).toContain('import { Spec } from "@confect/core";');
        expect(contents).not.toContain(
          'import { GroupSpec, Spec } from "@confect/core";',
        );
        expect(contents).toContain("const spec: Spec.Spec = Spec.make();");
        expect(contents).toContain("export default spec;");
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
        const contents = yield* templates.assembledSpec({ nodes });

        expect(contents).toContain(
          'import { GroupSpec, Spec } from "@confect/core";',
        );
        expect(contents).toContain(
          '.addAt("notes", $group$5_notes.addGroupAt("archived", GroupSpec.makeAt("archived").addGroupAt("legacy", $group$5_notes$8_archived$6_legacy)))',
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
        const contents = yield* templates.assembledSpec({ nodes });

        expect(contents).toContain(
          'import $group$7_scripts$11_operational$10_inviteUser$9_mutations from "../scripts/operational/inviteUser/mutations.spec";',
        );
        expect(contents).toContain(
          'import $group$7_scripts$11_operational$10_inviteUser$7_queries from "../scripts/operational/inviteUser/queries.spec";',
        );
        expect(contents).toContain(
          'import $group$7_scripts$11_operational$4_seed$9_mutations from "../scripts/operational/seed/mutations.spec";',
        );
        expect(contents).toContain(
          'import $group$7_scripts$11_operational$12_seedTestUser$9_mutations from "../scripts/operational/seedTestUser/mutations.spec";',
        );
        expect(contents).toContain(
          'import $group$7_scripts$11_operational$12_seedTestUser$7_queries from "../scripts/operational/seedTestUser/queries.spec";',
        );

        const importLines = contents
          .split("\n")
          .filter(
            (line) => line.startsWith("import ") && line.includes(".spec"),
          );
        expect(importLines).toHaveLength(leaves.length);

        expect(contents).toContain(
          '.addGroupAt("mutations", $group$7_scripts$11_operational$10_inviteUser$9_mutations)',
        );
        expect(contents).toContain(
          '.addGroupAt("queries", $group$7_scripts$11_operational$10_inviteUser$7_queries)',
        );
        expect(contents).toContain(
          '.addGroupAt("mutations", $group$7_scripts$11_operational$4_seed$9_mutations)',
        );
        expect(contents).toContain(
          '.addGroupAt("mutations", $group$7_scripts$11_operational$12_seedTestUser$9_mutations)',
        );
        expect(contents).toContain(
          '.addGroupAt("queries", $group$7_scripts$11_operational$12_seedTestUser$7_queries)',
        );
      }),
  );

  it.effect(
    "assembledSpec assembles every leaf for a deep catalog layout",
    () =>
      Effect.gen(function* () {
        // A parent leaf alongside subdirectory children at multiple nesting
        // depths. Each impl resolves its own group path impl-side, so the
        // assembled tree only needs the addAt/addGroupAt shape.
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
        const contents = yield* templates.assembledSpec({ nodes });

        // Tree-assembly shape is preserved; the addGroupAt-wrapped parent leaf
        // still ends up in the tree, and its impl resolves its group path
        // impl-side rather than through a `.addPath(...)` registration.
        expect(contents).toContain(
          "$group$5_remix$6_routes$4__app$7_catalog.addGroupAt(",
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
              runtime: Option.none(),
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
        const contents = yield* templates.assembledSpec({ nodes });

        expect(contents).toContain(
          'import $group$14_notesAndRandom$5_notes from "../notesAndRandom/notes.spec";',
        );
        expect(contents).toContain(
          'import $group$7_scripts$11_operational$4_seed$9_mutations from "../scripts/operational/seed/mutations.spec";',
        );
        expect(contents).toContain('import $group$3_env from "../env.spec";');
        expect(contents).not.toContain("\\");
      }),
    );
  });
}
