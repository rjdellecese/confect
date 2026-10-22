import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as ConvexConfig from "./ConvexConfig";
import * as OutputPlan from "./OutputPlan";
import * as templates from "./templates";

export const renderPlan = Effect.fn("ComponentBindings.renderPlan")(function* (
  components: ReadonlyArray<ConvexConfig.InstalledComponent>,
  confectDirectory: string,
) {
  const path = yield* Path.Path;
  const contents = yield* templates.components({
    components: components.map(({ name, componentDefinitionPath }) => ({
      name,
      typeImportPath: ConvexConfig.typeImportPath(
        path,
        componentDefinitionPath,
        path.join(confectDirectory, "_generated"),
      ),
    })),
  });
  return yield* Effect.fromResult(
    OutputPlan.make([
      OutputPlan.Operation.Write({
        target: OutputPlan.Target.Binding({ relativePath: "components.ts" }),
        contents,
      }),
    ]),
  );
});
