import { expect, layer } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Project from "../../../../packages/cli/test/integration/Project.ts";

const launcher = new URL("../../dist/rspackDev.mjs", import.meta.url).pathname;
const make = Project.makeWithLauncher([launcher, "dev"]);
const success = "Generated files are up-to-date";

layer(NodeServices.layer, { excludeTestServices: true })(
  "Rspack live development coordinator",
  (it) => {
    it.effect(
      "preserves separate configuration profiles and real component definitions",
      () =>
        Effect.gen(function* () {
          const project = yield* make;
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          for (const directory of [
            "confect/helpers",
            "confect/nested",
            "convex/feature",
          ])
            yield* fs.makeDirectory(path.join(project.root, directory));
          yield* project.write(
            "tsconfig.json",
            '{"compilerOptions":{"moduleResolution":"Bundler","jsxFactory":"rootFactory.h"}}',
          );
          yield* project.write(
            "confect/nested/tsconfig.json",
            '{"extends":"../../tsconfig.json","compilerOptions":{"jsxFactory":"nestedFactory.h"}}',
          );
          yield* project.write(
            "confect/helpers/name.tsx",
            'const rootFactory = { h: () => "list" }; const nestedFactory = { h: () => "other" }; export const name = <div />;',
          );
          yield* project.write(
            "confect/notes.spec.ts",
            `import {name} from "./helpers/name";\n${Project.spec.replace('name: "list"', "name")}`,
          );
          yield* project.write(
            "confect/notes.impl.ts",
            `import {name} from "./helpers/name";\n${Project.impl.replace('"list"', "name")}`,
          );
          yield* project.write(
            "confect/nested/other.spec.ts",
            `import {name} from "../helpers/name";\n${Project.spec.replace('name: "list"', "name").replace('"./_generated/', '"../_generated/')}`,
          );
          yield* project.write(
            "confect/nested/other.impl.ts",
            `import {name} from "../helpers/name";\n${Project.impl.replace('"list"', "name").replaceAll('"./_generated/', '"../_generated/').replace('"./notes.spec"', '"./other.spec"')}`,
          );
          yield* project.write(
            "convex/convex.config.ts",
            'import { defineApp } from "convex/server"; import feature from "./feature/convex.config"; const app = defineApp(); app.use(feature); export default app;',
          );
          const definition = (name: string) =>
            `import {defineComponent} from "convex/server"; export default defineComponent("${name}");`;
          yield* project.write(
            "convex/feature/convex.config.ts",
            definition("feature"),
          );
          const native = yield* project.start("dev");
          yield* native.waitFor(success);
          const initial = yield* project.generatedFiles;
          expect(initial[path.join("convex", "notes.ts")]).toContain(
            "export const list =",
          );
          expect(initial[path.join("convex", "nested", "other.ts")]).toContain(
            "export const other =",
          );
          const oracle = yield* project.start("codegen");
          yield* oracle.waitFor(success);
          expect(Number(yield* oracle.handle.exitCode)).toBe(0);
          expect(yield* project.generatedFiles).toEqual(initial);
          yield* Ref.set(native.output, "");
          yield* project.write(
            "convex/feature/convex.config.ts",
            definition("renamed"),
          );
          yield* native.waitFor(success);
          expect(yield* Ref.get(native.output)).not.toContain(
            "Performing initial sync",
          );
          const edited = yield* project.generatedFiles;
          expect(
            edited[path.join("confect", "_generated", "components.ts")],
          ).toContain("renamed");
          const finalOracle = yield* project.start("codegen");
          yield* finalOracle.waitFor(success);
          expect(Number(yield* finalOracle.handle.exitCode)).toBe(0);
          expect(yield* project.generatedFiles).toEqual(edited);
        }).pipe(Effect.scoped),
      { timeout: 90000 },
    );

    it.effect(
      "matches production output through edits, failed compilation recovery, and a configuration restart",
      () =>
        Effect.gen(function* () {
          const project = yield* make;
          const native = yield* project.start("dev");
          yield* native.waitFor(success);
          const initial = yield* project.generatedFiles;
          const oracle = yield* project.start("codegen");
          yield* oracle.waitFor(success);
          expect(Number(yield* oracle.handle.exitCode)).toBe(0);
          expect(yield* project.generatedFiles).toEqual(initial);
          yield* Ref.set(native.output, "");
          yield* project.write(
            "confect/notes.spec.ts",
            `console.log("NATIVE_EDIT");\n${Project.spec}`,
          );
          yield* native.waitFor("NATIVE_EDIT");
          yield* native.waitFor(success);
          expect(yield* Ref.get(native.output)).not.toContain(
            "Performing initial sync",
          );
          expect(yield* project.generatedFiles).toEqual(initial);
          yield* project.write("confect/notes.spec.ts", "export default {");
          yield* native.waitFor("failed");
          yield* project.write("confect/notes.spec.ts", Project.spec);
          yield* native.waitFor(success);
          expect(yield* project.generatedFiles).toEqual(initial);
          yield* Ref.set(native.output, "");
          yield* project.write(
            "tsconfig.json",
            '{"compilerOptions":{"moduleResolution":"Bundler","strict":true}}',
          );
          yield* native.waitFor("Performing initial sync");
          yield* native.waitFor(success);
          expect(
            (yield* Ref.get(native.output)).match(/Performing initial sync/g),
          ).toHaveLength(1);
          expect(yield* project.generatedFiles).toEqual(initial);
        }).pipe(Effect.scoped),
      { timeout: 90000 },
    );
  },
);
