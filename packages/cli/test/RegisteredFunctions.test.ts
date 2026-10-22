import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import * as GenerationSnapshot from "@confect/cli/GenerationSnapshot";
import * as OutputPlan from "@confect/cli/OutputPlan";
import * as RegisteredFunctions from "@confect/cli/RegisteredFunctions";
import * as templates from "@confect/cli/templates";
import * as NodePath from "@effect/platform-node/NodePath";
import { assert, expect, expectTypeOf, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Layer from "effect/Layer";
import type * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

layer(
  Layer.mergeAll(
    NodePath.layer,
    Layer.succeed(ConfectDirectory, {
      get: Effect.succeed("/project/confect"),
    }),
  ),
)("RegisteredFunctions", (it) => {
  it.effect.each(["Convex", "Node"] as const)(
    "renders nested %s registries without filesystem or evaluation services",
    (runtime) =>
      Effect.gen(function* () {
        const group: GenerationSnapshot.GroupTree = {
          runtime,
          functions: [
            { name: "native", provenance: "Convex" },
            { name: "list", provenance: "Confect" },
          ],
          groups: {
            child: {
              runtime,
              functions: [{ name: "get", provenance: "Confect" }],
              groups: {},
            },
          },
        };
        const snapshot = yield* Effect.fromResult(
          GenerationSnapshot.parse([["nested/notes.spec.ts", group]]),
        );
        const encode = Schema.encodeEffect(
          Schema.fromJsonString(Schema.Unknown),
        );
        const before = yield* encode(HashMap.toEntries(snapshot.leaves));
        const rendered = RegisteredFunctions.renderPlan(snapshot.leaves);
        expectTypeOf(rendered).toEqualTypeOf<
          Effect.Effect<
            OutputPlan.OutputPlan,
            OutputPlan.PlanError,
            ConfectDirectory | Path.Path
          >
        >();
        const plan = yield* rendered;
        expect(plan.operations).toEqual([
          OutputPlan.Operation.Write({
            target: OutputPlan.Target.Registry({
              relativePath: "nested/notes.ts",
            }),
            contents: yield* templates.registeredFunctionsForGroup({
              group,
              schemaImportPath: "../../schema",
              specImportPath: "../../../nested/notes.spec",
              implImportPath: "../../../nested/notes.impl",
            }),
          }),
        ]);
        expect(yield* encode(HashMap.toEntries(snapshot.leaves))).toBe(before);
        expect((yield* rendered).operations).toEqual(plan.operations);
      }),
  );

  it.effect(
    "rejects duplicate leaf destinations rather than overwriting earlier contents",
    () =>
      Effect.gen(function* () {
        const snapshot = yield* Effect.fromResult(
          GenerationSnapshot.parse([
            ["notes.spec.ts", { runtime: "Convex", functions: [], groups: {} }],
          ]),
        );
        const entries = HashMap.toEntries(snapshot.leaves);
        const result = yield* RegisteredFunctions.renderPlan([
          ...entries,
          ...entries,
        ]).pipe(Effect.result);
        assert(Result.isFailure(result));
        expect(result.failure.reason).toBe("ConflictingTarget");
      }),
  );
});
