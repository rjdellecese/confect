import { pathToFileURL } from "node:url";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Bundler from "@confect/cli/Bundler";

const BundlerLayer = Layer.mergeAll(NodePath.layer, NodeFileSystem.layer);

const tsconfigContents = JSON.stringify(
  {
    compilerOptions: {
      moduleResolution: "Bundler",
      paths: { "~/*": ["./*"] },
    },
  },
  null,
  2,
);

layer(BundlerLayer)("bundle", (it) => {
  it.effect(
    "bundles imports that resolve through tsconfig path aliases (regression for 9.0.0-next.4)",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tempDir = yield* fs.makeTempDirectoryScoped();

        yield* fs.writeFileString(
          path.join(tempDir, "tsconfig.json"),
          tsconfigContents,
        );
        yield* fs.writeFileString(
          path.join(tempDir, "sibling.ts"),
          `export const value = "bundled";\n`,
        );
        const entry = path.join(tempDir, "entry.ts");
        yield* fs.writeFileString(
          entry,
          `import { value } from "~/sibling";\nexport default value;\n`,
        );

        const bundled = yield* Bundler.bundle(entry);
        expect(bundled.module.default).toBe("bundled");
      }).pipe(Effect.scoped),
  );

  it.effect(
    "bundles first-party workspace deps whose dist uses extensionless relative imports",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tempDir = yield* fs.makeTempDirectoryScoped();

        // A workspace package living OUTSIDE node_modules, consumed via
        // `exports`→`dist`, whose emitted `dist` uses an extensionless relative
        // import (valid for bundlers, invalid for Node's native ESM resolver).
        const pkgDir = path.join(tempDir, "pkg");
        yield* fs.makeDirectory(path.join(pkgDir, "dist", "Scenario"), {
          recursive: true,
        });
        yield* fs.writeFileString(
          path.join(pkgDir, "package.json"),
          `{ "name": "@scope/lib", "type": "module", "exports": { "./Scenario": "./dist/Scenario.js" } }\n`,
        );
        yield* fs.writeFileString(
          path.join(pkgDir, "dist", "Scenario.js"),
          `export { value } from "./Scenario/Inner";\n`,
        );
        yield* fs.writeFileString(
          path.join(pkgDir, "dist", "Scenario", "Inner.js"),
          `export const value = "bundled";\n`,
        );

        // Symlink it into node_modules the way pnpm/npm/yarn link a workspace
        // dep. `realpathSync` must follow this back to `pkg/` (outside
        // node_modules) for it to be recognized as first-party and bundled.
        yield* fs.makeDirectory(path.join(tempDir, "node_modules", "@scope"), {
          recursive: true,
        });
        yield* fs.symlink(
          pkgDir,
          path.join(tempDir, "node_modules", "@scope", "lib"),
        );

        const entry = path.join(tempDir, "entry.ts");
        yield* fs.writeFileString(
          entry,
          `import { value } from "@scope/lib/Scenario";\nexport default value;\n`,
        );

        const bundled = yield* Bundler.bundle(entry);
        expect(bundled.module.default).toBe("bundled");
      }).pipe(Effect.scoped),
  );

  it.effect("keeps true third-party node_modules deps external", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      // Create the entry under the repo so the externalized `effect` resolves
      // via Node from the temp `.mjs` (externals load relative to it, not
      // bundled). `effect` resolves to a real path under node_modules, so it
      // must stay external — guards against over-bundling.
      const tempDir = yield* fs.makeTempDirectoryScoped({
        directory: process.cwd(),
      });

      const entry = path.join(tempDir, "entry.ts");
      yield* fs.writeFileString(
        entry,
        `import { pipe } from "effect/Function";\nexport default pipe(1, (n) => n + 1);\n`,
      );

      const bundled = yield* Bundler.bundle(entry);
      expect(bundled.module.default).toBe(2);
    }).pipe(Effect.scoped),
  );

  it.effect(
    "rewrites import.meta.url inside the bundle to the original source path",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tempDir = yield* fs.makeTempDirectoryScoped();

        const entry = path.join(tempDir, "entry.ts");
        yield* fs.writeFileString(entry, `export default import.meta.url;\n`);

        const bundled = yield* Bundler.bundle(entry);
        // esbuild canonicalizes `import.meta.url` to the entry's real path, so
        // resolve symlinks before comparing — otherwise this fails when the
        // temp dir lives under a symlinked root (e.g. macOS `/tmp` ->
        // `/private/tmp`).
        const realEntry = yield* fs.realPath(entry);
        expect(bundled.module.default).toBe(pathToFileURL(realEntry).href);
      }).pipe(Effect.scoped),
  );
});
