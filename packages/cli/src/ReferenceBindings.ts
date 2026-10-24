import * as Effect from "effect/Effect";
import type { LeafModule } from "./LeafModule";
import * as OutputPlan from "./OutputPlan";
import * as SpecAssemblyNode from "./SpecAssemblyNode";
import * as templates from "./templates";

export const renderPlan = Effect.fn("ReferenceBindings.renderPlan")(function* (
  leaves: ReadonlyArray<LeafModule>,
) {
  const scopes = yield* SpecAssemblyNode.scopedNodesFromLeaves(leaves);
  const scoped = yield* Effect.forEach(scopes, (scope) =>
    templates.scopedRefs(scope).pipe(
      Effect.map((contents) =>
        OutputPlan.Operation.Write({
          target: OutputPlan.Target.ScopedRef({
            relativePath: `${scope.path.pathSegments.join("/")}.ts`,
          }),
          contents,
        }),
      ),
    ),
  );
  return yield* Effect.fromResult(
    OutputPlan.make([
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
    ]),
  );
});
