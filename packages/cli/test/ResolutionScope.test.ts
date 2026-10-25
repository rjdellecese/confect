import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Array from "effect/Array";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as esbuild from "esbuild";
import * as CompilationInputs from "@confect/cli/CompilationInputs";
import * as ResolutionScope from "@confect/cli/ResolutionScope";

layer(NodeServices.layer, { excludeTestServices: true })(
  "ResolutionScope",
  (it) => {
    it.effect.each([
      { specifier: "dependency", kind: "import-statement", shared: true },
      { specifier: "dependency", kind: "require-call", shared: true },
      { specifier: "dependency", kind: "import-rule", shared: false },
      { specifier: "./dependency", kind: "import-statement", shared: false },
      { specifier: "#dependency", kind: "import-statement", shared: false },
      { specifier: "node:dependency", kind: "import-statement", shared: false },
    ] as const)(
      "keys $kind requests for $specifier by their guarded scope",
      ({ specifier, kind, shared }) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          yield* fs.writeFileString(path.join(root, "package.json"), "{}");
          const directories = [path.join(root, "a"), path.join(root, "b")];
          const inputs = yield* CompilationInputs.make("Once");
          const scopes = yield* ResolutionScope.make(path, inputs);
          const lookups = yield* Effect.forEach(directories, (directory) =>
            Effect.gen(function* () {
              yield* fs.makeDirectory(directory);
              const importer = path.join(directory, "entry.ts");
              yield* inputs.trackSource(importer);
              const args: esbuild.OnResolveArgs = {
                path: specifier,
                importer,
                namespace: "file",
                resolveDir: directory,
                kind,
                pluginData: undefined,
                with: {},
              };
              const local = yield* scopes.lookup(args, false);
              expect(ResolutionScope.key(local)).toBe(
                ResolutionScope.localKey(path, args),
              );
              return yield* scopes.lookup(args, true);
            }),
          );
          const keys = Array.map(lookups, ResolutionScope.key);
          expect(keys[0] === keys[1]).toBe(shared);
          yield* inputs.check;
        }).pipe(Effect.scoped),
    );
  },
);
