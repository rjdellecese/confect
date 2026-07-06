import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { assert, expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import * as Layer from "effect/Layer";
import { generateComponents } from "@confect/cli/confect/codegen";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import {
  discoverInstalledComponents,
  typeImportPath,
} from "@confect/cli/ConvexConfig";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import { ProjectRoot } from "@confect/cli/ProjectRoot";

const fixturesRoot = `${import.meta.dirname}/fixtures/components`;

const TestLayer = Layer.mergeAll(NodePath.layer, NodeFileSystem.layer);

const directoriesLayer = ({
  confectDirectory,
  convexDirectory,
  projectRoot,
}: {
  confectDirectory: string;
  convexDirectory: string;
  projectRoot: string;
}) =>
  Layer.mergeAll(
    Layer.mock(ConfectDirectory, {
      _tag: "@confect/cli/ConfectDirectory",
      get: Effect.succeed(confectDirectory),
    }),
    Layer.mock(ConvexDirectory, {
      _tag: "@confect/cli/ConvexDirectory",
      get: Effect.succeed(convexDirectory),
    }),
    Layer.mock(ProjectRoot, {
      _tag: "@confect/cli/ProjectRoot",
      get: Effect.succeed(projectRoot),
    }),
  );

layer(TestLayer)("discoverInstalledComponents", (it) => {
  it.effect(
    "lists npm components by mount name, keeping bare import specifiers",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const components = yield* discoverInstalledComponents(
          path.join(fixturesRoot, "bare", "convex", "convex.config.ts"),
          "convex/convex.config.ts",
        );

        expect(components).toEqual([
          {
            name: "secondPool",
            componentDefinitionPath: "@convex-dev/workpool",
          },
          {
            name: "workpool",
            componentDefinitionPath: "@convex-dev/workpool",
          },
        ]);
      }),
  );

  it.effect(
    "records locally-defined components as resolved absolute directories",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const components = yield* discoverInstalledComponents(
          path.join(fixturesRoot, "local", "convex", "convex.config.ts"),
          "convex/convex.config.ts",
        );

        assert.strictEqual(components.length, 1);
        const [waitlist] = components;
        assert(waitlist !== undefined);
        expect(waitlist.name).toBe("waitlist");
        expect(waitlist.componentDefinitionPath).toBe(
          path.join(fixturesRoot, "local", "convex", "waitlist"),
        );

        const importPath = typeImportPath(
          path,
          waitlist.componentDefinitionPath,
          path.join(fixturesRoot, "local", "confect", "_generated"),
        );
        expect(importPath).toBe("../../convex/waitlist");
      }),
  );

  it.effect(
    "discovers a component whose own definition installs other components",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const components = yield* discoverInstalledComponents(
          path.join(fixturesRoot, "nested", "convex", "convex.config.ts"),
          "convex/convex.config.ts",
        );

        // The workpool nested inside `test-nested` mounts on that component,
        // not on the app, so it isn't listed.
        expect(components).toEqual([
          { name: "nested", componentDefinitionPath: "test-nested" },
        ]);
      }),
  );

  it.effect("fails with a BuildError when the config throws on import", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const result = yield* Effect.either(
        discoverInstalledComponents(
          path.join(fixturesRoot, "throwing", "convex", "convex.config.ts"),
          "convex/convex.config.ts",
        ),
      );

      assert(Either.isLeft(result));
      expect(result.left._tag).toBe("ImportFailedError");
    }),
  );

  it.effect(
    "fails with InvalidConvexConfigError when a component name is invalid",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const result = yield* Effect.either(
          discoverInstalledComponents(
            path.join(fixturesRoot, "badName", "convex", "convex.config.ts"),
            "convex/convex.config.ts",
          ),
        );

        assert(Either.isLeft(result));
        assert(result.left._tag === "InvalidConvexConfigError");
        expect(result.left.reason).toContain('"not a valid name"');
      }),
  );

  it.effect(
    "fails with InvalidConvexConfigError when the default export is not an app definition",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const result = yield* Effect.either(
          discoverInstalledComponents(
            path.join(fixturesRoot, "invalid", "convex", "convex.config.ts"),
            "convex/convex.config.ts",
          ),
        );

        assert(Either.isLeft(result));
        expect(result.left._tag).toBe("InvalidConvexConfigError");
      }),
  );
});

layer(TestLayer)("generateComponents", (it) => {
  it.effect("writes a typed registry derived from `app.use(...)` calls", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const confectDirectory = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(confectDirectory, "_generated"));

      yield* generateComponents.pipe(
        Effect.provide(
          directoriesLayer({
            confectDirectory,
            convexDirectory: path.join(fixturesRoot, "bare", "convex"),
            projectRoot: path.join(fixturesRoot, "bare"),
          }),
        ),
      );

      const contents = yield* fs.readFileString(
        path.join(confectDirectory, "_generated", "components.ts"),
      );
      expect(contents).toBe(
        `import { componentsGeneric } from "convex/server";

export type Components = {
  "secondPool": import("@convex-dev/workpool/_generated/component.js").ComponentApi<"secondPool">;
  "workpool": import("@convex-dev/workpool/_generated/component.js").ComponentApi<"workpool">;
};

export const components: Components = componentsGeneric() as any;
`,
      );
    }).pipe(Effect.scoped),
  );

  it.effect("writes an empty registry when there is no convex.config.ts", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const confectDirectory = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(confectDirectory, "_generated"));
      const convexDirectory = yield* fs.makeTempDirectoryScoped();

      yield* generateComponents.pipe(
        Effect.provide(
          directoriesLayer({
            confectDirectory,
            convexDirectory,
            projectRoot: path.dirname(convexDirectory),
          }),
        ),
      );

      const contents = yield* fs.readFileString(
        path.join(confectDirectory, "_generated", "components.ts"),
      );
      expect(contents).toBe(
        `import { componentsGeneric } from "convex/server";

export type Components = {};

export const components: Components = componentsGeneric() as any;
`,
      );
    }).pipe(Effect.scoped),
  );
});
