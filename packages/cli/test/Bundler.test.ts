import { pathToFileURL } from "node:url";
import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as Bundler from "../src/Bundler";

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
        expect(bundled.module.default).toBe(pathToFileURL(entry).href);
      }).pipe(Effect.scoped),
  );
});
