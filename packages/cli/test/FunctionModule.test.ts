import * as GenerationSnapshot from "@confect/cli/GenerationSnapshot";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { assert, expect, expectTypeOf, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import * as GroupPath from "@confect/cli/GroupPath";
import { ProjectRoot } from "@confect/cli/ProjectRoot";
import { renderPlan } from "@confect/cli/FunctionModule";
import * as OutputPublisher from "@confect/cli/OutputPublisher";
import * as OutputPlan from "@confect/cli/OutputPlan";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

const GenerateFunctionsLayer = Layer.mergeAll(
  NodePath.layer,
  NodeFileSystem.layer,
);

const runGenerateForNodeGroup = ({
  snapshot,
  moduleRelativePath,
  registryRelativePath,
}: Parameters<typeof runGenerateForNodeGroupEffect>[0]) =>
  runGenerateForNodeGroupEffect({
    snapshot,
    moduleRelativePath,
    registryRelativePath,
  });

const runGenerateForNodeGroupEffect = Effect.fnUntraced(function* ({
  snapshot,
  moduleRelativePath,
  registryRelativePath,
}: {
  snapshot: GenerationSnapshot.GenerationSnapshot;
  moduleRelativePath: string;
  registryRelativePath: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const root = yield* fs.makeTempDirectoryScoped();
  const convexDir = path.join(root, "convex");
  const confectDir = path.join(root, "confect");
  yield* fs.makeDirectory(convexDir, { recursive: true });

  const registryPath = path.join(
    confectDir,
    "_generated",
    "registeredFunctions",
    registryRelativePath,
  );
  yield* fs.makeDirectory(path.dirname(registryPath), { recursive: true });
  yield* fs.writeFileString(registryPath, "export default {};\n");

  const TempDirsLayer = Layer.mergeAll(
    Layer.succeed(ProjectRoot, ProjectRoot.of({ get: Effect.succeed(root) })),
    Layer.succeed(
      ConvexDirectory,
      ConvexDirectory.of({ get: Effect.succeed(convexDir) }),
    ),
    Layer.succeed(
      ConfectDirectory,
      ConfectDirectory.of({ get: Effect.succeed(confectDir) }),
    ),
  );

  yield* renderPlan(GenerationSnapshot.plan(snapshot, [])).pipe(
    Effect.flatMap(OutputPublisher.publish),
    Effect.provide(TempDirsLayer),
  );

  const modulePath = path.join(convexDir, moduleRelativePath);
  const contents = yield* fs.readFileString(modulePath);

  const importMatch = contents.match(/from "([^"]+)"/);
  assert(importMatch !== null, "expected a registry import in the module");
  const resolved =
    path.resolve(path.dirname(modulePath), importMatch[1]!) + ".ts";
  const resolves = yield* fs.exists(resolved);

  return { contents, resolves };
}, Effect.scoped);

layer(GenerateFunctionsLayer)("renderPlan", (it) => {
  it.effect(
    "renders the whole wrapper plan without filesystem services or mutating its inputs",
    () =>
      Effect.gen(function* () {
        const input: GenerationSnapshot.ModulePlan = {
          removed: [GroupPath.make(["obsolete"])],
          changed: [
            {
              path: GroupPath.make(["nested", "notes"]),
              runtime: "Node",
              functionNames: ["list", "get"],
            },
          ],
        };
        const encode = Schema.encodeEffect(
          Schema.fromJsonString(Schema.Unknown),
        );
        const before = yield* encode(input);
        const rendered = renderPlan(input);
        expectTypeOf(rendered).toEqualTypeOf<
          Effect.Effect<
            OutputPlan.OutputPlan,
            OutputPlan.PlanError,
            Path.Path | ConfectDirectory | ConvexDirectory
          >
        >();
        const plan = yield* rendered.pipe(
          Effect.provideService(ConfectDirectory, {
            get: Effect.succeed("/project/confect"),
          }),
          Effect.provideService(ConvexDirectory, {
            get: Effect.succeed("/project/convex"),
          }),
        );
        expect(plan.operations).toEqual([
          OutputPlan.Operation.Remove({
            target: OutputPlan.Target.ConvexModule({
              relativePath: "obsolete.ts",
            }),
          }),
          OutputPlan.Operation.Write({
            target: OutputPlan.Target.ConvexModule({
              relativePath: "nested/notes.ts",
            }),
            contents:
              '"use node";\n\nimport registeredFunctions from "../../confect/_generated/registeredFunctions/nested/notes";\n\nexport const list = registeredFunctions.list;\nexport const get = registeredFunctions.get;\n',
          }),
        ]);
        expect(yield* encode(input)).toBe(before);
      }),
  );

  it.effect(
    "rejects a conflicting later wrapper before removing or writing any output",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        const obsolete = `${root}/obsolete.ts`;
        yield* fs.writeFileString(obsolete, "keep");
        const group = {
          path: GroupPath.make(["notes"]),
          runtime: "Convex" as const,
          functionNames: ["list"],
        };
        const result = yield* renderPlan({
          removed: [GroupPath.make(["obsolete"])],
          changed: [group, group],
        }).pipe(
          Effect.flatMap(OutputPublisher.publish),
          Effect.provideService(ConfectDirectory, {
            get: Effect.succeed(`${root}/confect`),
          }),
          Effect.provideService(ConvexDirectory, { get: Effect.succeed(root) }),
          Effect.provideService(ProjectRoot, { get: Effect.succeed(root) }),
          Effect.result,
        );
        assert(Result.isFailure(result));
        expect(result.failure).toMatchObject({
          _tag: "OutputPlanError",
          reason: "ConflictingTarget",
        });
        expect(yield* fs.readFileString(obsolete)).toBe("keep");
        expect(yield* fs.exists(`${root}/notes.ts`)).toBe(false);
      }).pipe(Effect.scoped),
  );

  // A Node group declared with `GroupSpec.makeNode()` generates `convex/<path>.ts`
  // carrying the `"use node"` directive and importing its registry at the matching
  // path. Exercised from a clean tree.
  it.effect("generates a top-level Node module with `use node`", () =>
    Effect.gen(function* () {
      const snapshot = yield* Effect.fromResult(
        GenerationSnapshot.parse([
          [
            "typedErrorsNode.spec.ts",
            {
              runtime: "Node",
              functions: [{ name: "failingNodeAction", provenance: "Confect" }],
              groups: {},
            },
          ],
        ]),
      );

      const { contents, resolves } = yield* runGenerateForNodeGroup({
        snapshot,
        moduleRelativePath: "typedErrorsNode.ts",
        registryRelativePath: "typedErrorsNode.ts",
      });

      expect(contents).toContain(`"use node";`);
      expect(contents).toContain(
        "export const failingNodeAction = registeredFunctions.failingNodeAction;",
      );
      expect(resolves).toBe(true);
    }),
  );

  // A nested Node group (a `makeNode()` spec at `notes/archived`) generates
  // `convex/notes/archived.ts` with `"use node"` and a registry import that
  // resolves at the matching nested path.
  it.effect("generates a nested Node module preserving its path", () =>
    Effect.gen(function* () {
      const snapshot = yield* Effect.fromResult(
        GenerationSnapshot.parse([
          [
            "notes.spec.ts",
            {
              runtime: "Convex",
              functions: [],
              groups: {
                archived: {
                  runtime: "Node",
                  functions: [
                    { name: "failingNodeAction", provenance: "Confect" },
                  ],
                  groups: {},
                },
              },
            },
          ],
        ]),
      );

      const { contents, resolves } = yield* runGenerateForNodeGroup({
        snapshot,
        moduleRelativePath: "notes/archived.ts",
        registryRelativePath: "notes/archived.ts",
      });

      expect(contents).toContain(`"use node";`);
      expect(resolves).toBe(true);
    }),
  );
});
