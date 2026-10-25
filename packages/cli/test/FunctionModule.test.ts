import * as GenerationSnapshot from "@confect/cli/GenerationSnapshot";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { assert, expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import * as GroupPath from "@confect/cli/GroupPath";
import * as GroupPaths from "@confect/cli/GroupPaths";
import { ProjectRoot } from "@confect/cli/ProjectRoot";
import { generateFunctions, removeGroups } from "@confect/cli/FunctionModule";

const fixtureRoot = `${import.meta.dirname}/../../server/test/mock-backend/fixtures`;
const fixtureConvex = `${fixtureRoot}/convex`;

const RemoveGroupsLayer = Layer.mergeAll(
  NodePath.layer,
  NodeFileSystem.layer,
  Layer.succeed(
    ConfectDirectory,
    ConfectDirectory.of({ get: Effect.succeed(`${fixtureRoot}/confect`) }),
  ),
  Layer.succeed(
    ConvexDirectory,
    ConvexDirectory.of({ get: Effect.succeed(fixtureConvex) }),
  ),
);

layer(RemoveGroupsLayer)("removeGroups", (it) => {
  it.effect("succeeds when the target convex module does not exist", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const missingGroup = GroupPaths.GroupPaths.make(
        HashSet.make(GroupPath.make(["does", "not", "exist"])),
      );
      const modulePath = path.join(fixtureConvex, "does/not/exist.ts");

      expect(yield* fs.exists(modulePath)).toBe(false);
      yield* removeGroups(missingGroup);
      expect(yield* fs.exists(modulePath)).toBe(false);
    }),
  );
});

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

  yield* generateFunctions(snapshot).pipe(Effect.provide(TempDirsLayer));

  const modulePath = path.join(convexDir, moduleRelativePath);
  const contents = yield* fs.readFileString(modulePath);

  const importMatch = contents.match(/from "([^"]+)"/);
  assert(importMatch !== null, "expected a registry import in the module");
  const resolved =
    path.resolve(path.dirname(modulePath), importMatch[1]!) + ".ts";
  const resolves = yield* fs.exists(resolved);

  return { contents, resolves };
}, Effect.scoped);

layer(GenerateFunctionsLayer)("generateFunctions", (it) => {
  // A Node group declared with `GroupSpec.makeNode()` generates `convex/<path>.ts`
  // carrying the `"use node"` directive and importing its registry at the matching
  // path. Exercised from a clean tree, so it also guards the `writeGroups` path.
  it.effect("generates a top-level Node module with `use node`", () =>
    Effect.gen(function* () {
      const snapshot = yield* Effect.fromResult(
        GenerationSnapshot.parse([
          [
            "typedErrorsNode.spec.ts",
            {
              runtime: "Node",
              functionNames: ["failingNodeAction"],
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
              functionNames: [],
              groups: {
                archived: {
                  runtime: "Node",
                  functionNames: ["failingNodeAction"],
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
