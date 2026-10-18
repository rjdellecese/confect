import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { assert, expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { generateComponents } from "@confect/cli/confect/codegen";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import {
  discoverInstalledComponents,
  typeImportPath,
} from "@confect/cli/ConvexConfig";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import { ProjectRoot } from "@confect/cli/ProjectRoot";
import * as Compilation from "@confect/cli/Compilation";

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
    Layer.succeed(
      ConfectDirectory,
      ConfectDirectory.of({
        get: Effect.succeed(confectDirectory),
      }),
    ),
    Layer.succeed(
      ConvexDirectory,
      ConvexDirectory.of({
        get: Effect.succeed(convexDirectory),
      }),
    ),
    Layer.succeed(
      ProjectRoot,
      ProjectRoot.of({
        get: Effect.succeed(projectRoot),
      }),
    ),
  );

layer(TestLayer)("discoverInstalledComponents", (it) => {
  it.effect.each(["standalone", "persistent"] as const)(
    "refreshes component exports on a subsequent %s generation",
    (mode) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({
          directory: import.meta.dirname,
        });
        const component = path.join(root, "node_modules", "component");
        yield* fs.makeDirectory(component, { recursive: true });
        yield* fs.writeFileString(
          path.join(component, "one.ts"),
          'import { defineComponent } from "convex/server"; export default defineComponent("one");',
        );
        yield* fs.writeFileString(
          path.join(component, "two.ts"),
          'import { defineComponent } from "convex/server"; export default defineComponent("two");',
        );
        const manifest = (target: string) =>
          fs.writeFileString(
            path.join(component, "package.json"),
            `{ "name": "component", "type": "module", "exports": { "./convex.config": "./${target}.ts" } }`,
          );
        yield* manifest("one");
        const config = path.join(root, "convex.config.ts");
        const contents =
          'import { defineApp } from "convex/server"; import component from "component/convex.config"; const app = defineApp(); app.use(component); export default app;';
        yield* fs.writeFileString(config, contents);
        const program = Effect.gen(function* () {
          const first = yield* Compilation.runJob(
            discoverInstalledComponents(config, "convex.config.ts"),
          );
          expect((yield* first.exit)[0]?.name).toBe("one");
          yield* manifest("two");
          yield* fs.writeFileString(config, contents + "\n");
          const second = yield* Compilation.runJob(
            discoverInstalledComponents(config, "convex.config.ts"),
          );
          expect((yield* second.exit)[0]?.name).toBe("two");
          if (mode === "persistent")
            expect(second.receipts[0]?.context).toBe(
              first.receipts[0]?.context,
            );
        });
        yield* mode === "persistent"
          ? program.pipe(
              Effect.provide(Compilation.layer({ ownedDirectories: [] })),
            )
          : program;
      }).pipe(Effect.scoped),
  );
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
        expect(path.resolve(waitlist.componentDefinitionPath)).toBe(
          path.resolve(path.join(fixturesRoot, "local", "convex", "waitlist")),
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
      const result = yield* Effect.result(
        discoverInstalledComponents(
          path.join(fixturesRoot, "throwing", "convex", "convex.config.ts"),
          "convex/convex.config.ts",
        ),
      );

      assert(Result.isFailure(result));
      expect(result.failure._tag).toBe("ImportFailedError");
    }),
  );

  it.effect(
    "fails with InvalidConvexConfigError when a component name is invalid",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const result = yield* Effect.result(
          discoverInstalledComponents(
            path.join(fixturesRoot, "badName", "convex", "convex.config.ts"),
            "convex/convex.config.ts",
          ),
        );

        assert(Result.isFailure(result));
        assert(result.failure._tag === "InvalidConvexConfigError");
        expect(result.failure.reason).toContain('"not a valid name"');
      }),
  );

  it.effect(
    "fails with InvalidConvexConfigError when the default export is not an app definition",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const result = yield* Effect.result(
          discoverInstalledComponents(
            path.join(fixturesRoot, "invalid", "convex", "convex.config.ts"),
            "convex/convex.config.ts",
          ),
        );

        assert(Result.isFailure(result));
        expect(result.failure._tag).toBe("InvalidConvexConfigError");
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
