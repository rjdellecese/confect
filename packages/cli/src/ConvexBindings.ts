import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import type { OptionalFile } from "./EntryPoint";
import * as OutputPlan from "./OutputPlan";
import * as templates from "./templates";
import { toModuleImportPath } from "./utils";

export const source = {
  Http: "http.ts",
  Crons: "crons.ts",
  Auth: "auth.ts",
} as const;
const target = {
  Http: "http.ts",
  Crons: "crons.ts",
  Auth: "auth.config.ts",
} as const;

export const renderOptionals = Effect.fn("ConvexBindings.renderOptionals")(
  function* (
    intents: ReadonlyArray<{
      readonly file: OptionalFile;
      readonly action: "Write" | "Remove";
    }>,
    confectDirectory: string,
    convexDirectory: string,
  ) {
    const path = yield* Path.Path;
    const operations = yield* Effect.forEach(intents, ({ file, action }) =>
      Effect.gen(function* () {
        const output = OutputPlan.Target.ConvexBinding({
          relativePath: target[file],
        });
        if (action === "Remove")
          return OutputPlan.Operation.Remove({ target: output });
        const importPath = yield* toModuleImportPath(
          path.relative(
            convexDirectory,
            path.join(confectDirectory, source[file]),
          ),
        );
        const contents = yield* {
          Http: () => templates.http({ httpImportPath: importPath }),
          Crons: () => templates.crons({ cronsImportPath: importPath }),
          Auth: () => templates.authConfig({ authImportPath: importPath }),
        }[file]();
        return OutputPlan.Operation.Write({ target: output, contents });
      }),
    );
    return yield* Effect.fromResult(OutputPlan.make(operations));
  },
);

export const renderSchema = Effect.fn("ConvexBindings.renderSchema")(function* (
  confectDirectory: string,
  convexDirectory: string,
) {
  const path = yield* Path.Path;
  const convexSchemaImportPath = yield* toModuleImportPath(
    path.relative(
      convexDirectory,
      path.join(confectDirectory, "_generated", "convexSchema.ts"),
    ),
  );
  return yield* Effect.fromResult(
    OutputPlan.make([
      OutputPlan.Operation.Write({
        target: OutputPlan.Target.ConvexBinding({ relativePath: "schema.ts" }),
        contents: yield* templates.schema({ convexSchemaImportPath }),
      }),
    ]),
  );
});
