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

// Spec with a single Node-runtime function group (`node.typedErrorsNode`),
// mirroring what `Spec.merge` hands `generateFunctions` for a project with a
// `confect/node/*` group.
const nodeSpec = Spec.merge(
  Spec.make(),
  Spec.makeNode().addAt(
    "typedErrorsNode",
    GroupSpec.makeNode().addFunction(
      FunctionSpec.publicNodeAction({
        name: "failingNodeAction",
        args: () => emptyArgs,
        returns: () => emptyReturns,
      }),
    ),
  ),
);

layer(GenerateFunctionsLayer)("generateFunctions", (it) => {
  // Regression test for the clean-tree codegen bug: when no `convex/` modules
  // exist yet, every group takes the "new group" (`writeGroups`) branch. That
  // branch used to leave the leading `node` segment in the registry import
  // path, so the generated `convex/node/<name>.ts` imported
  // `registeredFunctions/node/<name>` while the registry file is actually
  // written at `registeredFunctions/<name>`. The incremental path stripped the
  // segment correctly, hiding the bug until a from-scratch regeneration.
  it.effect(
    "writes a resolvable registry import for a Node group on a clean tree",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        const root = yield* fs.makeTempDirectoryScoped();
        const convexDir = path.join(root, "convex");
        const confectDir = path.join(root, "confect");
        yield* fs.makeDirectory(convexDir, { recursive: true });
        // The registry file lives at the top level (no `node/` segment), as
        // emitted by `registeredFunctionsRelativePath`.
        const registryDir = path.join(
          confectDir,
          "_generated",
          "registeredFunctions",
        );
        yield* fs.makeDirectory(registryDir, { recursive: true });
        yield* fs.writeFileString(
          path.join(registryDir, "typedErrorsNode.ts"),
          "export default {};\n",
        );

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

        yield* generateFunctions(nodeSpec).pipe(Effect.provide(TempDirsLayer));

        const nodeModulePath = path.join(
          convexDir,
          "node",
          "typedErrorsNode.ts",
        );
        const contents = yield* fs.readFileString(nodeModulePath);

        const importMatch = contents.match(/from "([^"]+)"/);
        assert(
          importMatch !== null,
          "expected a registry import in the module",
        );
        const importSpecifier = importMatch[1]!;

        // The import must not retain the `node/` segment...
        expect(importSpecifier).not.toContain("registeredFunctions/node/");
        // ...and must resolve to the registry file that was actually written.
        const resolved =
          path.resolve(path.dirname(nodeModulePath), importSpecifier) + ".ts";
        expect(yield* fs.exists(resolved)).toBe(true);
      }).pipe(Effect.scoped),
  );
});
