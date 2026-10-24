import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import type * as GenerationSnapshot from "./GenerationSnapshot";
import type * as GroupPath from "./GroupPath";
import { CodeBlockWriter } from "./CodeBlockWriter";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import { toModuleImportPath } from "./utils";
import * as OutputPlan from "./OutputPlan";

export const render = ({
  functionNames,
  registeredFunctionsImportPath,
  useNode = false,
}: Parameters<typeof renderEffect>[0]) =>
  renderEffect({ functionNames, registeredFunctionsImportPath, useNode });

const renderEffect = Effect.fnUntraced(function* ({
  functionNames,
  registeredFunctionsImportPath,
  useNode = false,
}: {
  functionNames: ReadonlyArray<string>;
  registeredFunctionsImportPath: string;
  useNode?: boolean;
}) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

  if (useNode) {
    yield* cbw.writeLine(`"use node";`);
    yield* cbw.blankLine();
  }

  yield* cbw.writeLine(
    `import registeredFunctions from "${registeredFunctionsImportPath}";`,
  );
  yield* cbw.newLine();
  yield* Effect.forEach(functionNames, (name) =>
    cbw.writeLine(`export const ${name} = registeredFunctions.${name};`),
  );

  return yield* cbw.toString();
});

/**
 * Compute the module import specifier (relative to `modulePath`) for a group's
 * registry file under `confect/_generated/registeredFunctions/`. The registry
 * path mirrors the group's path one-to-one (see
 * `registeredFunctionsRelativePath` in `LeafModule.ts`) for both Convex and
 * Node groups.
 */
export const registeredFunctionsImportPathForGroup = Effect.fnUntraced(
  function* (groupPath: GroupPath.GroupPath, modulePath: string) {
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;

    const registeredFunctionsPath =
      path.join(
        confectDirectory,
        "_generated",
        "registeredFunctions",
        ...groupPath.pathSegments,
      ) + ".ts";

    return yield* toModuleImportPath(
      path.relative(path.dirname(modulePath), registeredFunctionsPath),
    );
  },
);

export const renderPlan = Effect.fn("FunctionModule.renderPlan")(function* (
  plan: GenerationSnapshot.ModulePlan,
) {
  const path = yield* Path.Path;
  const convexDirectory = yield* ConvexDirectory.get;
  const writes = yield* Effect.forEach(plan.changed, (group) =>
    Effect.gen(function* () {
      const relativePath = group.path.pathSegments.join("/") + ".ts";
      const modulePath = path.join(convexDirectory, relativePath);
      const registeredFunctionsImportPath =
        yield* registeredFunctionsImportPathForGroup(group.path, modulePath);
      const contents = yield* render({
        functionNames: group.functionNames,
        registeredFunctionsImportPath,
        useNode: group.runtime === "Node",
      });
      return OutputPlan.Operation.Write({
        target: OutputPlan.Target.ConvexModule({ relativePath }),
        contents,
      });
    }),
  );
  return yield* Effect.fromResult(
    OutputPlan.make([
      ...Array.map(plan.removed, (group) =>
        OutputPlan.Operation.Remove({
          target: OutputPlan.Target.ConvexModule({
            relativePath: group.pathSegments.join("/") + ".ts",
          }),
        }),
      ),
      ...writes,
    ]),
  );
});
