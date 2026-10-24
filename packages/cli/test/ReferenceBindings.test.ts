import * as ReferenceBindings from "@confect/cli/ReferenceBindings";
import * as OutputPlan from "@confect/cli/OutputPlan";
import * as LeafModule from "@confect/cli/LeafModule";
import * as SpecAssemblyNode from "@confect/cli/SpecAssemblyNode";
import type { SnapshotError } from "@confect/cli/SnapshotError";
import * as templates from "@confect/cli/templates";
import * as NodePath from "@effect/platform-node/NodePath";
import { assert, expect, expectTypeOf, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

for (const platform of [
  { name: "POSIX", layer: NodePath.layerPosix },
  { name: "Windows", layer: NodePath.layerWin32 },
]) {
  layer(platform.layer)(`ReferenceBindings on ${platform.name}`, (it) => {
    it.effect.each([
      [],
      ["notes"],
      ["notes/archived/legacy", "notes", "env", "other/child"],
    ])("renders unchanged bytes for %j without evaluating leaves", (names) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const leaves = yield* Effect.forEach(names, (name) =>
          LeafModule.toLeafModule(name.split("/").join(path.sep) + ".spec.ts"),
        );
        const encode = Schema.encodeEffect(
          Schema.fromJsonString(Schema.Unknown),
        );
        const before = yield* encode(leaves);
        const rendered = ReferenceBindings.renderPlan(leaves);
        expectTypeOf(rendered).toEqualTypeOf<
          Effect.Effect<
            OutputPlan.OutputPlan,
            OutputPlan.PlanError | SnapshotError
          >
        >();
        const plan = yield* rendered;
        const scopes = yield* SpecAssemblyNode.scopedNodesFromLeaves(leaves);
        const scoped = yield* Effect.forEach(scopes, (scope) =>
          templates.scopedRefs(scope).pipe(
            Effect.map((contents) =>
              OutputPlan.Operation.Write({
                target: OutputPlan.Target.ScopedRef({
                  relativePath: scope.path.pathSegments.join("/") + ".ts",
                }),
                contents,
              }),
            ),
          ),
        );
        expect(plan.operations).toEqual([
          OutputPlan.Operation.Write({
            target: OutputPlan.Target.Binding({ relativePath: "spec.ts" }),
            contents: yield* templates.assembledSpec({
              nodes: SpecAssemblyNode.assemblyNodesFromLeaves(leaves),
            }),
          }),
          OutputPlan.Operation.Write({
            target: OutputPlan.Target.Binding({ relativePath: "refs.ts" }),
            contents: yield* templates.refs({ specImportPath: "./spec" }),
          }),
          ...scoped,
        ]);
        expect(yield* encode(leaves)).toBe(before);
        expect((yield* rendered).operations).toEqual(plan.operations);
        for (const operation of plan.operations) {
          assert(operation._tag === "Write");
          expect(
            operation.contents.includes(SpecAssemblyNode.SCOPED_REFS_HEADER),
          ).toBe(operation.target._tag === "ScopedRef");
          expect(operation.contents).not.toContain(".impl");
          expect(operation.contents).not.toContain("convex/server");
        }
      }),
    );

    it.effect.each([
      "../notes.spec.ts",
      "notes//child.spec.ts",
      "notes.ts/child.spec.ts",
    ])(
      "rejects invalid source path %s without publication services",
      (relativePath) =>
        Effect.gen(function* () {
          const leaf = yield* LeafModule.toLeafModule("notes.spec.ts");
          const result = yield* ReferenceBindings.renderPlan([
            { ...leaf, relativePath },
          ]).pipe(Effect.result);
          assert(Result.isFailure(result));
          expect(result.failure).toMatchObject({
            _tag: "SnapshotError",
            reason: "NoncanonicalPath",
          });
        }),
    );
  });
}
