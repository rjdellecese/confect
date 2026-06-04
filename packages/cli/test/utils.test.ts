import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import { ConfectDirectory } from "../src/ConfectDirectory";
import { ConvexDirectory } from "../src/ConvexDirectory";
import * as GroupPath from "../src/GroupPath";
import * as GroupPaths from "../src/GroupPaths";
import { removeGroups } from "../src/utils";

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
