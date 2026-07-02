import { pathToFileURL } from "node:url";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
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
