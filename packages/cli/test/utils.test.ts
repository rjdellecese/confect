import { FunctionSpec, GroupSpec, Spec } from "@confect/core";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { assert, expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { ConfectDirectory } from "../src/ConfectDirectory";
import { ConvexDirectory } from "../src/ConvexDirectory";
import * as GroupPath from "../src/GroupPath";
import * as GroupPaths from "../src/GroupPaths";
import { ProjectRoot } from "../src/ProjectRoot";
import { generateFunctions, removeGroups } from "../src/utils";

const fixtureRoot = `${import.meta.dirname}/../../server/test/mock-backend/fixtures`;
const fixtureConvex = `${fixtureRoot}/convex`;

const RemoveGroupsLayer = Layer.mergeAll(
  NodePath.layer,
  NodeFileSystem.layer,
  Layer.mock(ConfectDirectory, {
    _tag: "@confect/cli/ConfectDirectory",
    get: Effect.succeed(`${fixtureRoot}/confect`),
  }),
  Layer.mock(ConvexDirectory, {
    _tag: "@confect/cli/ConvexDirectory",
    get: Effect.succeed(fixtureConvex),
  }),
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

const emptyArgs = Schema.Struct({});
const emptyReturns = Schema.Null;

const nodeGroup = () =>
  GroupSpec.makeNode().addFunction(
    FunctionSpec.publicNodeAction({
      name: "failingNodeAction",
      args: () => emptyArgs,
      returns: () => emptyReturns,
    }),
  );

/**
 * Run `generateFunctions(spec)` against a clean convex tree (no pre-existing
 * `convex/` modules — every group takes the `writeGroups` "new group" branch),
 * with a registry file pre-seeded at `registryRelativePath` so the generated
 * module's import can be resolved on disk. Returns the generated module's
 * contents plus whether its registry import resolves to a real file.
 */
const runGenerateForNodeGroup = ({
  spec,
  moduleRelativePath,
  registryRelativePath,
}: {
  spec: Spec.AnyWithProps;
  moduleRelativePath: string;
  registryRelativePath: string;
}) =>
  Effect.gen(function* () {
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
      Layer.mock(ProjectRoot, {
        _tag: "@confect/cli/ProjectRoot",
        get: Effect.succeed(root),
      }),
      Layer.mock(ConvexDirectory, {
        _tag: "@confect/cli/ConvexDirectory",
        get: Effect.succeed(convexDir),
      }),
      Layer.mock(ConfectDirectory, {
        _tag: "@confect/cli/ConfectDirectory",
        get: Effect.succeed(confectDir),
      }),
    );

    yield* generateFunctions(spec).pipe(Effect.provide(TempDirsLayer));

    const modulePath = path.join(convexDir, moduleRelativePath);
    const contents = yield* fs.readFileString(modulePath);

    const importMatch = contents.match(/from "([^"]+)"/);
    assert(importMatch !== null, "expected a registry import in the module");
    const resolved =
      path.resolve(path.dirname(modulePath), importMatch[1]!) + ".ts";
    const resolves = yield* fs.exists(resolved);

    return { contents, resolves };
  }).pipe(Effect.scoped);

layer(GenerateFunctionsLayer)("generateFunctions", (it) => {
  // A Node group declared with `GroupSpec.makeNode()` generates `convex/<path>.ts`
  // carrying the `"use node"` directive and importing its registry at the matching
  // path. Exercised from a clean tree, so it also guards the `writeGroups` path.
  it.effect("generates a top-level Node module with `use node`", () =>
    Effect.gen(function* () {
      const spec = Spec.make().addAt("typedErrorsNode", nodeGroup());

      const { contents, resolves } = yield* runGenerateForNodeGroup({
        spec,
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
      const spec = Spec.make().addAt(
        "notes",
        GroupSpec.makeAt("notes").addGroupAt("archived", nodeGroup()),
      );

      const { contents, resolves } = yield* runGenerateForNodeGroup({
        spec,
        moduleRelativePath: "notes/archived.ts",
        registryRelativePath: "notes/archived.ts",
      });

      expect(contents).toContain(`"use node";`);
      expect(resolves).toBe(true);
    }),
  );
});
