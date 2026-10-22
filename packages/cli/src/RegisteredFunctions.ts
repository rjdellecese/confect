import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { ConfectDirectory } from "./ConfectDirectory";
import type * as GenerationSnapshot from "./GenerationSnapshot";
import { implPathForSpec } from "./LeafModule";
import type { SpecModulePath } from "./SpecModulePath";
import * as OutputPlan from "./OutputPlan";
import * as templates from "./templates";
import { toModuleImportPath } from "./utils";

export const renderPlan = Effect.fn("RegisteredFunctions.renderPlan")(
  function* (
    leaves: Iterable<readonly [SpecModulePath, GenerationSnapshot.GroupTree]>,
  ) {
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;

    const writes = yield* Effect.forEach(
      leaves,
      Effect.fnUntraced(function* ([relativePath, group]) {
        const registryRelativePath = path.join(
          "registeredFunctions",
          relativePath.slice(0, -".spec.ts".length) + ".ts",
        );
        const registryPath = path.join(
          confectDirectory,
          "_generated",
          registryRelativePath,
        );
        const implRelativePath = yield* implPathForSpec(relativePath);
        const schemaImportPath = yield* toModuleImportPath(
          path.relative(
            path.dirname(registryPath),
            path.join(confectDirectory, "_generated", "schema.ts"),
          ),
        );
        const specImportPath = yield* toModuleImportPath(
          path.relative(
            path.dirname(registryPath),
            path.join(confectDirectory, relativePath),
          ),
        );
        const implImportPath = yield* toModuleImportPath(
          path.relative(
            path.dirname(registryPath),
            path.join(confectDirectory, implRelativePath),
          ),
        );

        const contents = yield* templates.registeredFunctionsForGroup({
          group,
          schemaImportPath,
          specImportPath,
          implImportPath,
        });

        return OutputPlan.Operation.Write({
          target: OutputPlan.Target.Registry({
            relativePath: relativePath.slice(0, -".spec.ts".length) + ".ts",
          }),
          contents,
        });
      }),
    );
    return yield* Effect.fromResult(OutputPlan.make(writes));
  },
);
